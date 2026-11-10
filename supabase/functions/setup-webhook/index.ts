import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { adminWebhookSecret } from '../_shared/telegram-security.ts';

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const webhookSecret = await adminWebhookSecret(botToken, Deno.env.get('TELEGRAM_WEBHOOK_SECRET'));
  const expected = Deno.env.get('TELEGRAM_SETUP_SECRET') ?? webhookSecret;
  const provided = (req.headers.get("x-admin-token") || "").trim();
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!botToken || !supabaseUrl) throw new Error('Webhook configuration missing');
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
      }
    );

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to set webhook" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
