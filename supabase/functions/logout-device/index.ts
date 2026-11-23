import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { proxyPrimaryKeyRequest, isPrimaryKeyServer } from '../_shared/key-authority.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const raw = await req.text();
    const primary = await proxyPrimaryKeyRequest('logout-device', raw, isPrimaryKeyServer(Deno.env.get('SUPABASE_URL') || ''));
    if (primary) {
      return new Response(await primary.text(), {
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

    const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return new Response(JSON.stringify({ ok: false, code: 'verification_unavailable' }), { status: 503, headers: corsHeaders });
    const supabase = createClient(url, serviceKey);
    const { data, error } = await supabase.rpc('logout_access_key_device', { p_key: key, p_device_fp: deviceFp });
    // The row lock is shared with login: freeing one phone cannot evict another.
    return new Response(JSON.stringify(error || !data ? { ok: false, code: 'verification_unavailable', error: 'Logout temporarily unavailable.' } : data), {
      status: error || !data ? 503 : data.ok ? 200 : 401,
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
