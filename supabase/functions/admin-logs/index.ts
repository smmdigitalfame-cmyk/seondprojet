import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

  // Admin token = TELEGRAM_ADMIN_CHAT_ID_1 (already a project secret).
  const expected = (Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_1") || "").trim();
  const provided =
    (req.headers.get("x-admin-token") || new URL(req.url).searchParams.get("token") || "").trim();

  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  const { data, error } = await supabase
    .from("webhook_logs")
    .select(
      "id, payment_id, amount_paise, rupees, telegram_chat_id, generated_key, plan_label, expires_at, status, telegram_sent, error, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ logs: data || [] }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});