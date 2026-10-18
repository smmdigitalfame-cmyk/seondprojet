import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
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
