import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  return digits;
}

function isUsableKey(row: { active?: boolean; expires_at?: string | null } | null | undefined): boolean {
  if (!row?.active) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const deviceFp = String(body.device_fp || "").trim();
    const createdAfterRaw = String(body.created_after || "").trim();
    const createdAfterIso = createdAfterRaw && !Number.isNaN(Date.parse(createdAfterRaw))
      ? new Date(createdAfterRaw).toISOString()
      : "";

    if (!deviceFp) {
      return new Response(JSON.stringify({ found: false, error: "device_fp required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only path: device fingerprint match against keys/webhook notes.
    // Phone/email lookups removed — they allowed unauthenticated key theft.
    {
      const nowIso = new Date().toISOString();
      let keyQuery = supabase
        .from("access_keys")
        .select("key, expires_at, active, device_fingerprints, created_at")
        .contains("device_fingerprints", [deviceFp])
        .eq("active", true)
        .or(`expires_at.gt.${nowIso},expires_at.is.null`);
      if (createdAfterIso) keyQuery = keyQuery.gte("created_at", createdAfterIso);
      const { data: ak } = await keyQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isUsableKey(ak)) {
        return new Response(
          JSON.stringify({ found: true, key: ak.key, expires_at: ak.expires_at }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Fallback — scan recent webhook_logs whose raw notes carry this device_fp
      const sinceFp = createdAfterIso || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: fpLogs } = await supabase
        .from("webhook_logs")
        .select("generated_key, payment_id, raw, created_at")
        .gte("created_at", sinceFp)
        .in("status", ["success_no_chat", "success"])
        .not("generated_key", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const log of fpLogs || []) {
        const notes =
          log?.raw?.payload?.payment?.entity?.notes ||
          log?.raw?.payload?.order?.entity?.notes || {};
        if (String(notes.device_fp || "").trim() === deviceFp) {
          const { data: ak2 } = await supabase
            .from("access_keys")
            .select("key, expires_at, active")
            .eq("razorpay_payment_id", log.payment_id)
            .maybeSingle();
          if (isUsableKey(ak2)) {
            return new Response(
              JSON.stringify({ found: true, key: ak2.key, expires_at: ak2.expires_at }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }
      return new Response(JSON.stringify({ found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("claim-key-by-phone error", e);
    return new Response(JSON.stringify({ found: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});