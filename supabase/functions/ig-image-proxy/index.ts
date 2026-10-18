const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "content-type, content-length, content-range, accept-ranges",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Timing-Allow-Origin": "*",
};

const ALLOWED = ["cdninstagram.com", "fbcdn.net", "instagram.com", "socialhubapi.com", "clipssaver.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = ALLOWED.some((h) => parsed.hostname.endsWith(h));
    if (!ok) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fwdHeaders: Record<string, string> = {
      Referer: "https://www.instagram.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    const range = req.headers.get("range");
    if (range) fwdHeaders["Range"] = range;

    const upstream = await fetch(parsed.toString(), { headers: fwdHeaders });

    if (!upstream.body || (upstream.status >= 400)) {
      return new Response(JSON.stringify({ error: "Upstream fail", status: upstream.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Infer a proper Content-Type. iOS Safari refuses to render video frames
    // when the MIME type is application/octet-stream or missing — it silently
    // falls back to audio-only playback, which is exactly what screen
    // recorders capture as "black video with audio".
    const upstreamCT = (upstream.headers.get("content-type") || "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    let contentType = upstreamCT;
    const isBadCT = !contentType || contentType.includes("octet-stream") || contentType.includes("binary");
    if (isBadCT) {
      if (path.endsWith(".mp4") || path.includes(".mp4")) contentType = "video/mp4";
      else if (path.endsWith(".webm")) contentType = "video/webm";
      else if (path.endsWith(".mov")) contentType = "video/quicktime";
      else if (path.endsWith(".m3u8")) contentType = "application/vnd.apple.mpegurl";
      else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (path.endsWith(".png")) contentType = "image/png";
      else if (path.endsWith(".webp")) contentType = "image/webp";
      else contentType = "application/octet-stream";
    }

    const passHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    };
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    if (cl) passHeaders["Content-Length"] = cl;
    if (cr) passHeaders["Content-Range"] = cr;

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...passHeaders,
        // Upstream URLs are signed and short-lived. A month-long immutable cache
        // kept broken/expired responses on users' phones long after a refresh.
        "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=300",
        "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
