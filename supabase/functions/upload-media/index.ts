import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-access-key, x-device-fp, x-file-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Bot-issued keys live on the primary key server; mirror the scraper's fallback.
const PRIMARY_KEY_SERVER = "https://xkgjifugwislpbczoduy.supabase.co/functions/v1/";
const PRIMARY_OK = new Map<string, number>();

async function primaryKeyValid(key: string, fp: string): Promise<boolean> {
  if ((Deno.env.get("SUPABASE_URL") || "").includes("xkgjifugwislpbczoduy")) return false;
  const cacheKey = `${key}::${fp}`;
  const okAt = PRIMARY_OK.get(cacheKey);
  if (okAt && Date.now() - okAt < 5 * 60_000) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(PRIMARY_KEY_SERVER + "check-key-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceFingerprint: fp }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.valid !== false) {
      PRIMARY_OK.set(cacheKey, Date.now());
      return true;
    }
  } catch (_) { /* treat as invalid */ }
  return false;
}

function safeFileName(name: string, contentType: string) {
  const decoded = decodeURIComponent(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (decoded.includes(".")) return decoded;
  const ext = contentType.includes("video") ? "mp4" : contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return `${decoded || "upload"}.${ext}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const key = String(req.headers.get("x-access-key") || "").trim().toUpperCase();
    const deviceFp = String(req.headers.get("x-device-fp") || "").trim();
    const contentType = req.headers.get("content-type") || "application/octet-stream";
    const contentLength = Number(req.headers.get("content-length") || "0");

    if (!key || !deviceFp) {
      return new Response(JSON.stringify({ error: "Login required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      return new Response(JSON.stringify({ error: "Only image and video uploads are allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (contentLength > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "File is too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ak } = await supabase
      .from("access_keys")
      .select("key, active, expires_at, device_fingerprints")
      .eq("key", key)
      .eq("active", true)
      .maybeSingle();
    const fps: string[] = Array.isArray(ak?.device_fingerprints) ? ak!.device_fingerprints : [];
    const expired = ak?.expires_at ? new Date(ak.expires_at).getTime() <= Date.now() : false;
    const localOk = !!ak && !expired && fps.includes(deviceFp);
    if (!localOk && !(await primaryKeyValid(key, deviceFp))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "File is too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fileName = safeFileName(req.headers.get("x-file-name") || "upload", contentType);
    const random = crypto.randomUUID();
    const path = `uploads/${key}/${Date.now()}-${random}-${fileName}`;

    const { error } = await supabase.storage.from("reel-media").upload(path, bytes, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });
    if (error) {
      console.error("upload-media storage error", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data } = supabase.storage.from("reel-media").getPublicUrl(path);
    return new Response(JSON.stringify({ ok: true, url: data.publicUrl, path }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("upload-media error", e);
    return new Response(JSON.stringify({ error: "Upload failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});