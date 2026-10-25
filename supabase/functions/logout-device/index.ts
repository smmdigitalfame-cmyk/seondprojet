import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Live key server (the one the Telegram bot writes to). It is the source of
// truth for keys, so every app URL (Lovable + Vercel) accepts the same keys.
const PRIMARY_KEY_SERVER = "https://xkgjifugwislpbczoduy.supabase.co/functions/v1/";

async function forwardToPrimary(name: string, raw: string): Promise<{ status: number; text: string } | null> {
  if (Deno.env.get("SUPABASE_URL")?.includes("xkgjifugwislpbczoduy")) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(PRIMARY_KEY_SERVER + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const raw = await req.text();
    const primary = await forwardToPrimary("logout-device", raw);
    if (primary && primary.status < 300) {
      return new Response(primary.text, {
        status: primary.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch {}
    const deviceFp = String(body.device_fp || "").trim();
    const key = String(body.key || "").trim().toUpperCase();
    if (!deviceFp || !key) {
      return new Response(JSON.stringify({ ok: false, error: "key and device_fp required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Proof of ownership: caller must supply the key currently bound to
    // this device fingerprint. Prevents random attackers from revoking
    // other users' keys via guessed fingerprints.
    const { data: ak } = await supabase
      .from("access_keys")
      .select("key, device_fingerprints, active")
      .eq("key", key)
      .eq("active", true)
      .maybeSingle();
    const fps: string[] = Array.isArray(ak?.device_fingerprints) ? ak!.device_fingerprints : [];
    if (!ak || !fps.includes(deviceFp)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Logout ends this device session; it must not revoke a paid key before
    // its expiry. Keep the fingerprint bound so a single-device key can be
    // used again only on the same licensed device.
    const { error } = await supabase
      .from("access_keys")
      .update({ device_fingerprints: fps.filter((f) => f !== deviceFp), last_seen_at: null, updated_at: new Date().toISOString() })
      .eq("key", key);

    if (error) {
      console.error("logout-device update error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("logout-device error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
