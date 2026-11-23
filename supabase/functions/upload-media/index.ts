import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkPrimaryDevice } from '../_shared/key-authority.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-access-key, x-device-fp, x-file-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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

    const license = await checkPrimaryDevice(key, deviceFp);
    if (!license.ok) {
      return new Response(JSON.stringify({ error: license.error, code: license.code }), { status: license.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return new Response(JSON.stringify({ error: "Upload temporarily unavailable." }), { status: 503, headers: corsHeaders });
    const supabase = createClient(url, serviceKey);

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