import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { checkPrimaryDevice } from '../_shared/key-authority.ts';

async function sendToAllAdmins(botToken: string, chatIds: string[], text: string) {
  const results = await Promise.allSettled(
    chatIds.map(id =>
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id.trim(), text, parse_mode: "HTML" }),
      })
    )
  );
  return results;
}

function getAdminChatIds() {
  const ids = [
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_1") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_2") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_3") || "",
    ...(Deno.env.get("TELEGRAM_CHAT_ID") || "").split(","),
  ];
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const username = String(body?.username || "").trim().slice(0, 64);
    const key = String(body?.key || "").trim().toUpperCase();
    const deviceFp = String(body?.device_fp || "").trim();
    const ip = String(body?.ip || "").trim().slice(0, 64);
    const location = String(body?.location || "").trim().slice(0, 96);

    const ALLOWED_ACTIONS = new Set(["LOGIN", "LOGOUT", "SEARCH", "PROFILE_VIEW"]);
    if (!ALLOWED_ACTIONS.has(action) || !key || !deviceFp) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns this key on this device.
    const license = await checkPrimaryDevice(key, deviceFp);
    if (!license.ok) {
      return new Response(JSON.stringify({ error: license.error, code: license.code }), {
        status: license.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeUser = username.replace(/[<>&]/g, "");
    const safeIp = ip.replace(/[<>&]/g, "");
    const safeLoc = location.replace(/[<>&]/g, "");
    const text = `🔎 <b>${action}</b>\n────────────────\n🎯 <b>Target:</b> <code>${safeUser || "-"}</code>\n🔑 <b>Key:</b> <code>${key}</code>\n📍 <b>Location:</b> ${safeLoc || "Unknown"}\n🌐 <b>IP:</b> <code>${safeIp || "Unknown"}</code>\n📱 <b>Device:</b> <code>${deviceFp}</code>\n⏱ <b>Time:</b> ${new Date().toLocaleString()}\n────────────────\nPowered by DarkSideX 🚀`;

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatIds = getAdminChatIds();

    if (!botToken || chatIds.length === 0) {
      return new Response(JSON.stringify({ error: "Telegram not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const results = await sendToAllAdmins(botToken, chatIds, text);
    console.log("Telegram send results:", results.length, "admins");

    return new Response(JSON.stringify({ ok: true, sent_to: chatIds.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
