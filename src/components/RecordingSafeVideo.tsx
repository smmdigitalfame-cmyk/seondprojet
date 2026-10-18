import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";

type RecordingSafeVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  /** Keep direct <video> rendering on desktop, mirror through canvas on mobile recorders. */
  recorderMode?: "mobile" | "always" | "off";
  /** Optional same-file fallback (for example the media proxy) if the direct CDN URL expires or rejects playback. */
  fallbackSrc?: string;
};

const isMobileRecorderTarget = () => {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
};

const needsCanvasMirror = (mode: RecordingSafeVideoProps["recorderMode"]) => {
  if (mode === "off") return false;
  if (mode === "always") return true;
  return isMobileRecorderTarget();
};

/** Cap the mirror surface so several reels on screen don't blow up GPU memory
 *  (Android screen recorders get killed by the OS under memory pressure). */
const MAX_MIRROR_EDGE = 640;
/** ~30fps is plenty for a mirrored preview and halves the compositing cost. */
const MIN_FRAME_MS = 1000 / 30;
/** Watchdog: if the canvas stops receiving frames the recorder captures black. */
const WATCHDOG_MS = 700;

/**
 * Mobile screen recorders often cancel or capture black frames when the browser
 * puts <video> on a protected/hardware overlay plane. We keep the real video
 * playing for audio/timing, then mirror decoded frames to a canvas that records
 * reliably as normal page pixels.
 */
const RecordingSafeVideo = forwardRef<HTMLVideoElement, RecordingSafeVideoProps>(
  ({ className, style, recorderMode = "mobile", fallbackSrc, onCanPlay, onLoadedData, onPlay, onPause, onEnded, onError, ...props }, forwardedRef) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const rafRef = useRef<number | null>(null);
    const videoFrameRef = useRef<number | null>(null);
    const lastDrawRef = useRef(0);
    const visibleRef = useRef(true);
    const hasFrameRef = useRef(false);
    const [canvasMirror, setCanvasMirror] = useState(() => needsCanvasMirror(recorderMode));
    const [hasFrame, setHasFrame] = useState(false);
    const [activeSrc, setActiveSrc] = useState(props.src);

    useEffect(() => {
      setCanvasMirror(needsCanvasMirror(recorderMode));
    }, [recorderMode]);

    const setVideoRef = useCallback(
      (node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    const stopMirror = useCallback(() => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const video = videoRef.current as (HTMLVideoElement & { cancelVideoFrameCallback?: (handle: number) => void }) | null;
      if (videoFrameRef.current != null) {
        video?.cancelVideoFrameCallback?.(videoFrameRef.current);
        videoFrameRef.current = null;
      }
    }, []);

    const scheduleFrame = useCallback((callback: () => void) => {
      // Always rAF: `requestVideoFrameCallback` never fires while a video is
      // paused or stalled, which left the mirror canvas unpainted (black in
      // screen recordings). rAF keeps a steady heartbeat in every state.
      rafRef.current = requestAnimationFrame(callback);
    }, []);

    const drawFrame = useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !canvasMirror) return;

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const due = now - lastDrawRef.current >= MIN_FRAME_MS;
      const active = visibleRef.current && (typeof document === "undefined" || !document.hidden);

      if (due && active && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const scale = Math.min(1, MAX_MIRROR_EDGE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          ctxRef.current = null;
        }

        try {
          if (!ctxRef.current) {
            // NOTE: never use `desynchronized: true` here. A low-latency canvas
            // is promoted to a hardware overlay plane, which Android screen
            // recorders capture as solid black (the exact bug we mirror to fix).
            ctxRef.current = canvas.getContext("2d", { alpha: false });
            if (ctxRef.current) ctxRef.current.imageSmoothingQuality = "medium";
          }
          const ctx = ctxRef.current;
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            lastDrawRef.current = now;
            if (!hasFrameRef.current) {
              hasFrameRef.current = true;
              setHasFrame(true);
            }
          }
        } catch {
          // If a provider blocks canvas drawing, fall back to the native video.
          setCanvasMirror(false);
          return;
        }
      }

      // Keep a heartbeat even while paused/stalled: a canvas that stops being
      // painted can be dropped from the recorder's composition (black frames).
      if (active) {
        scheduleFrame(drawFrame);
      }
    }, [canvasMirror, scheduleFrame]);

    const startMirror = useCallback(() => {
      if (!canvasMirror) return;
      stopMirror();
      scheduleFrame(drawFrame);
    }, [canvasMirror, drawFrame, scheduleFrame, stopMirror]);

    // Only mirror what's actually on screen — offscreen reels keep their canvas idle.
    useEffect(() => {
      if (!canvasMirror || typeof IntersectionObserver === "undefined") return;
      const node = wrapperRef.current;
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          visibleRef.current = !!entry?.isIntersecting;
          if (visibleRef.current) startMirror();
          else stopMirror();
        },
        { threshold: 0.01 }
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [canvasMirror, startMirror, stopMirror]);

    // Pause the mirror loop when the tab/app is backgrounded, resume on return.
    useEffect(() => {
      if (!canvasMirror || typeof document === "undefined") return;
      const onVisibility = () => {
        if (document.hidden) stopMirror();
        else if (visibleRef.current) startMirror();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [canvasMirror, startMirror, stopMirror]);

    // Watchdog: some Android WebViews silently drop the rAF loop after the
    // recorder attaches. Restart it whenever painting stalls while visible.
    useEffect(() => {
      if (!canvasMirror) return;
      const id = window.setInterval(() => {
        if (!visibleRef.current || document.hidden) return;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastDrawRef.current > WATCHDOG_MS) startMirror();
      }, WATCHDOG_MS);
      return () => window.clearInterval(id);
    }, [canvasMirror, startMirror]);

    useEffect(() => {
      return () => {
        stopMirror();
        ctxRef.current = null;
        const canvas = canvasRef.current;
        if (canvas) {
          // Release the backing surface so Android reclaims GPU memory immediately.
          canvas.width = 1;
          canvas.height = 1;
        }
        const video = videoRef.current;
        if (video) {
          try {
            video.pause();
            video.muted = true;
            video.removeAttribute("src");
            video.load();
          } catch {
            // Best-effort cleanup: Android WebView needs the media surface released
            // before route changes, otherwise some OEM recorders stop immediately.
          }
        }
      };
    }, [stopMirror]);

    useEffect(() => {
      setActiveSrc(props.src);
      stopMirror();
      ctxRef.current = null;
      lastDrawRef.current = 0;
      hasFrameRef.current = false;
      setHasFrame(false);
    }, [props.src, stopMirror]);

    useEffect(() => {
      if (canvasMirror) startMirror();
      else stopMirror();
    }, [canvasMirror, startMirror, stopMirror]);

    const hasPositionClass = /\b(absolute|fixed|relative|sticky)\b/.test(className || "");
    const objectFit = style?.objectFit || (/(^|\s)object-contain(\s|$)/.test(className || "") ? "contain" : "cover");

    const wrapperStyle: React.CSSProperties = {
      ...style,
      ...(hasPositionClass ? {} : { position: "relative" }),
      overflow: style?.overflow || "hidden",
      backgroundColor: style?.backgroundColor || "#000",
    };

    const videoStyle: React.CSSProperties = {
      opacity: canvasMirror ? 0 : style?.opacity,
      objectFit,
      pointerEvents: canvasMirror ? "none" : style?.pointerEvents,
    };

    const videoClassName = canvasMirror
      ? "absolute left-0 top-0 h-px w-px"
      : "absolute inset-0 h-full w-full";

    return (
      <div ref={wrapperRef} className={className} style={wrapperStyle}>
        {canvasMirror && props.poster && !hasFrame && (
          <img
            src={props.poster}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit, pointerEvents: "none" }}
          />
        )}
        <video
          {...props}
          src={activeSrc}
          {...({ "x-webkit-airplay": "deny", "webkit-playsinline": "true" } as Record<string, string>)}
          ref={setVideoRef}
          className={videoClassName}
          // NOTE: never force crossOrigin here — CDN clips without CORS headers
          // fail to load entirely (endless reload). If the canvas gets tainted we
          // catch the draw error and fall back to the native <video>.
          crossOrigin={props.crossOrigin}
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback nofullscreen"
          style={videoStyle}
          onCanPlay={(event) => {
            startMirror();
            onCanPlay?.(event);
          }}
          onLoadedData={(event) => {
            startMirror();
            onLoadedData?.(event);
          }}
          onPlay={(event) => {
            startMirror();
            onPlay?.(event);
          }}
          onPause={(event) => {
            // Draw one last frame so the canvas doesn't go black while paused.
            scheduleFrame(drawFrame);
            onPause?.(event);
          }}
          onEnded={(event) => {
            stopMirror();
            onEnded?.(event);
          }}
          onError={(event) => {
            if (fallbackSrc && fallbackSrc !== activeSrc) {
              setActiveSrc(fallbackSrc);
              return;
            }
            onError?.(event);
          }}
        />
        {canvasMirror && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            style={{ pointerEvents: "none", objectFit }}
          />
        )}
      </div>
    );
  }
);

RecordingSafeVideo.displayName = "RecordingSafeVideo";

export default RecordingSafeVideo;
