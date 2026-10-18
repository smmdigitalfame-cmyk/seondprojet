import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

// Validates Telegram WebApp initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string, botToken: string): Promise<{ ok: boolean; userId?: string }> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    const authDate = Number(params.get("auth_date") || "0");
    if (!hash || !authDate) return { ok: false };
    // Reject data older than 24h
    if (Date.now() / 1000 - authDate > 86400) return { ok: false };
    params.delete("hash");
    const pairs: string[] = [];
    for (const [k, v] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      pairs.push(`${k}=${v}`);
    }
    const dataCheckString = pairs.join("\n");
    const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
    const computed = await hmacSha256(secretKey, dataCheckString);
    if (toHex(computed) !== hash) return { ok: false };
    const userJson = params.get("user");
    if (!userJson) return { ok: false };
    const user = JSON.parse(userJson);
    return { ok: true, userId: String(user?.id || "") };
  } catch {
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const initData = String(body?.init_data || "").trim();
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    if (!initData || !botToken) {
      return new Response(JSON.stringify({ found: false, error: "Missing Telegram initData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verified = await verifyInitData(initData, botToken);
    if (!verified.ok || !verified.userId) {
      return new Response(JSON.stringify({ found: false, error: "Invalid Telegram signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const chatId = verified.userId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("access_keys")
      .select("key, label, expires_at, active")
      .eq("telegram_chat_id", chatId)
      .eq("active", true)
      .or(`expires_at.gt.${nowIso},expires_at.is.null`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("query error", error);
      return new Response(JSON.stringify({ found: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ found: true, key: data.key, expires_at: data.expires_at, label: data.label }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ found: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});