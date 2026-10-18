/**
 * Reliable autoplay helpers.
 *
 * Mobile browsers reject `video.play()` when:
 *  - the element is not ready yet (fast scrolling → play() called before metadata)
 *  - the video has audio and there was no user gesture
 *
 * These helpers retry playback on readiness events and gracefully fall back to
 * muted playback, unmuting again on the first user gesture.
 */

type PlayOptions = {
  /** Desired mute state. If false and autoplay is blocked, we play muted and unmute on first gesture. */
  muted?: boolean;
  /** Restart from the beginning. */
  restart?: boolean;
};

const GESTURE_EVENTS = ["pointerdown", "touchstart", "click", "keydown"] as const;

/** Waits for a real user gesture, then unmutes the given video (once). */
function unmuteOnFirstGesture(video: HTMLVideoElement, isCancelled: () => boolean) {
  const handler = () => {
    GESTURE_EVENTS.forEach((e) => document.removeEventListener(e, handler));
    if (isCancelled()) return;
    try {
      video.muted = false;
      video.volume = 1;
      void video.play().catch(() => {});
    } catch {
      /* ignore */
    }
  };
  GESTURE_EVENTS.forEach((e) =>
    document.addEventListener(e, handler, { once: true, passive: true })
  );
  return () => GESTURE_EVENTS.forEach((e) => document.removeEventListener(e, handler));
}

/**
 * Starts playback as fast as possible and keeps retrying until the media is
 * actually playing. Returns a cleanup function that cancels pending retries.
 */
export function startPlayback(
  video: HTMLVideoElement,
  { muted = true, restart = false }: PlayOptions = {}
): () => void {
  let cancelled = false;
  let attempting = false;
  let removeGesture: (() => void) | null = null;

  const cleanupListeners = () => {
    video.removeEventListener("loadeddata", attempt);
    video.removeEventListener("canplay", attempt);
    video.removeEventListener("canplaythrough", attempt);
  };

  async function attempt() {
    if (cancelled || attempting) return;
    attempting = true;
    try {
      video.muted = muted;
      if (!muted) video.volume = 1;
      if (restart && video.currentTime > 0.05 && video.readyState >= 1) {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      await video.play();
      if (!cancelled) cleanupListeners();
    } catch {
      if (cancelled) return;
      // Autoplay with sound blocked → play muted, unmute on first gesture.
      if (!video.muted) {
        try {
          video.muted = true;
          await video.play();
          if (!cancelled) {
            cleanupListeners();
            removeGesture = unmuteOnFirstGesture(video, () => cancelled);
          }
        } catch {
          /* retry on readiness events below */
        }
      }
    } finally {
      attempting = false;
    }
  }

  // Make sure the browser is actually fetching data (fast scroll fix).
  try {
    if (video.preload !== "auto") video.preload = "auto";
    if (video.readyState === 0) video.load();
  } catch {
    /* ignore */
  }

  video.addEventListener("loadeddata", attempt);
  video.addEventListener("canplay", attempt);
  video.addEventListener("canplaythrough", attempt);
  void attempt();

  return () => {
    cancelled = true;
    cleanupListeners();
    removeGesture?.();
  };
}

/** Pause helper that also frees decoder pressure on long feeds. */
export function stopPlayback(video: HTMLVideoElement, resetTime = false) {
  try {
    video.pause();
    if (resetTime) video.currentTime = 0;
  } catch {
    /* ignore */
  }
}
