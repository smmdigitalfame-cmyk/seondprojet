import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  return digits;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const telegramChatId = String(body.telegram_chat_id || "").trim();
    const phone = normalizePhone(String(body.phone || ""));
    const email = normalizeEmail(String(body.email || ""));
    const deviceId = String(body.device_id || "").trim();
    const planId = String(body.plan_id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
    const source = String(body.source || "payment_page").trim() || "payment_page";
    const deviceOnly = Boolean(deviceId && !phone && !email);
    const storedEmail = deviceOnly
      ? `${deviceId.toLowerCase().replace(/[^a-z0-9-]/g, "")}@device.local`
      : email;

    // EITHER a Telegram chat id (bot flow) OR a device id (APK/web flow) is required
    if (!telegramChatId && !deviceId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Telegram ID or Device ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone && !email && !deviceOnly) {
      return new Response(JSON.stringify({ ok: false, error: "Enter phone or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phone && phone.length !== 10) {
      return new Response(JSON.stringify({ ok: false, error: "Enter valid 10 digit phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (storedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storedEmail)) {
      return new Response(JSON.stringify({ ok: false, error: "Enter valid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("payment_user_links").insert({
      telegram_chat_id: telegramChatId || null,
      phone: phone || null,
      email: storedEmail || null,
      source: deviceId ? `web:${deviceId}:plan:${planId || "unknown"}` : source,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error("payment link insert failed", error);
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
    console.error("register-payment-contact error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});