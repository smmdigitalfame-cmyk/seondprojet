import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

function parseDuration(input: string): { days: number; label: string } | null {
  if (/^\d+$/.test(input)) {
    const days = parseInt(input);
    if (days <= 0) return null;
    return { days, label: `${days} day${days > 1 ? 's' : ''}` };
  }

  const map: Record<string, { days: number; label: string }> = {
    "lifetime": { days: 0, label: "Lifetime" },
    "lt": { days: 0, label: "Lifetime" },
  };

  const match = input.toLowerCase().match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1]);
    if (days <= 0) return null;
    return { days, label: `${days} day${days > 1 ? 's' : ''}` };
  }

  return map[input.toLowerCase()] || null;
}

// Send message to ALL admins
async function sendToAllAdmins(botToken: string, adminChatIds: string[], text: string) {
  await Promise.allSettled(
    adminChatIds.map(id =>
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id.trim(), text, parse_mode: "HTML" }),
      })
    )
  );
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

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const adminChatIds = getAdminChatIds();

  try {
    if (!botToken || adminChatIds.length === 0) {
      console.error("Telegram bot is not configured with admin chat IDs");
      return new Response("ok", { status: 200 });
    }

    const update = await req.json();
    const message = update?.message;
    if (!message?.text) {
      return new Response("ok", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    console.log("Chat ID:", chatId, "Admin IDs:", adminChatIds, "Text:", text);

    // ============== PUBLIC COMMANDS (any user) ==============
    // /start or /buy → send payment page link
    if (text === "/start" || text.startsWith("/buy") || text.startsWith("/pay")) {
      const payUrl = `https://repo-clone-buddy-16.lovable.app/pay?chat_id=${chatId}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          text:
            `👋 <b>Welcome!</b>\n\nApna plan choose karke payment karo. ` +
            `Payment successful hote hi <b>Access Key</b> yahi pe mil jayegi.\n\n` +
            `💰 <b>Plans:</b>\n` +
            `• ₹100 → 1 Day\n` +
            `• ₹500 → 7 Days\n` +
            `• ₹1000 → 30 Days\n\n` +
            `🔗 <b>Pay Here:</b>\n${payUrl}\n\n` +
            `<i>Link sirf aapke account ke liye hai. Payment ke baad key automatic deliver hogi.</i>`,
        }),
      });
      return new Response("ok", { status: 200 });
    }

    // /mykey → show user's latest active key
    if (text === "/mykey" || text === "/key") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: keys } = await supabase
        .from("access_keys")
        .select("key, expires_at, active")
        .eq("telegram_chat_id", String(chatId))
        .order("created_at", { ascending: false })
        .limit(5);

      if (!keys || keys.length === 0) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: "HTML",
            text: "❌ Aapke paas koi key nahi hai.\n\nKey lene ke liye /buy command bhejo.",
          }),
        });
      } else {
        const list = keys
          .map((k, i) => {
            const exp = k.expires_at
              ? new Date(k.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Lifetime";
            const status = k.active ? "✅" : "🚫";
            return `${i + 1}. ${status} <code>${k.key}</code>\n   📅 ${exp}`;
          })
          .join("\n\n");
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: "HTML",
            text: `🔑 <b>Your Keys</b>\n\n${list}`,
          }),
        });
      }
      return new Response("ok", { status: 200 });
    }

    // /claim <payment_id> → user can attach an old successful payment to their Telegram and get the key
    if (text.startsWith("/claim")) {
      const parts = text.split(/\s+/);
      const paymentId = parts[1]?.trim();
      if (!paymentId || !paymentId.startsWith("pay_")) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: "HTML",
            text: `❌ Usage:\n<code>/claim pay_XXXXXXXX</code>\n\nRazorpay receipt me jo Payment ID hai woh bhejo.`,
          }),
        });
        return new Response("ok", { status: 200 });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: row } = await supabase
        .from("access_keys")
        .select("key, label, expires_at, telegram_chat_id, razorpay_payment_id")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();

      if (!row) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: "HTML",
            text: `❌ Payment ID nahi mili: <code>${paymentId}</code>\n\nPayment successful hai to admin ko receipt bhejo.`,
          }),
        });
        return new Response("ok", { status: 200 });
      }

      if (row.telegram_chat_id && row.telegram_chat_id !== String(chatId)) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: "HTML",
            text: `⚠️ Ye payment already kisi Telegram account se linked hai. Admin ko contact karo.`,
          }),
        });
        return new Response("ok", { status: 200 });
      }

      await supabase
        .from("access_keys")
        .update({ telegram_chat_id: String(chatId), updated_at: new Date().toISOString() })
        .eq("razorpay_payment_id", paymentId);

      const expFmt = row.expires_at
        ? new Date(row.expires_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "Lifetime";

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `✅ <b>Payment linked successfully!</b>\n\n` +
            `🔑 <code>${row.key}</code>\n` +
            `📅 <b>Valid till:</b> ${expFmt} IST\n\n` +
            `<i>👆 Tap key to copy, app me paste karke login karo.</i>`,
        }),
      });

      await sendToAllAdmins(
        botToken,
        adminChatIds,
        `✅ <b>User claimed payment</b>\n\n👤 Chat ID: <code>${chatId}</code>\n🧾 Payment: <code>${paymentId}</code>\n🔑 <code>${row.key}</code>`
      );
      return new Response("ok", { status: 200 });
    }

    // Only allow commands from admins
    if (!adminChatIds.includes(String(chatId))) {
      console.log("Unauthorized - chatId not in adminChatIds");
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          parse_mode: "HTML",
          text: "⛔ Ye admin command hai.\n\nKey lene ke liye /buy bhejo.",
        }),
      });
      return new Response("ok", { status: 200 });
    }

    // /gen <name> <duration>
    if (text.startsWith("/gen") || text.startsWith("/generate")) {
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        await sendToAllAdmins(
          botToken,
          adminChatIds,
          `❌ <b>Usage:</b>\n<code>/gen &lt;name&gt; &lt;days&gt;</code>\n\n<b>Examples:</b>\n<code>/gen Ahmed 7</code> → 7 din\n<code>/gen Ali 30</code> → 30 din\n<code>/gen VIP lifetime</code> → permanent`
        );
        return new Response("ok", { status: 200 });
      }

      const userName = parts[1];
      const durationInput = parts[2];
      const maxDevices = parseInt(parts[3] || "1") || 1;

      const duration = parseDuration(durationInput);
      if (!duration) {
        await sendToAllAdmins(botToken, adminChatIds,
          `❌ Invalid: <code>${durationInput}</code>\n\nSirf number daalo (1, 2, 7, 30...) ya "lifetime"`
        );
        return new Response("ok", { status: 200 });
      }

      const key = generateKey();
      const now = new Date();
      const expiresAt = duration.days > 0
        ? new Date(now.getTime() + duration.days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error } = await supabase.from("access_keys").insert({
        key,
        label: userName,
        active: true,
        expires_at: expiresAt,
        max_devices: maxDevices,
      });

      if (error) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ DB Error: ${error.message}`);
        return new Response("ok", { status: 200 });
      }

      const expLine = expiresAt
        ? `📅 <b>Exp:</b> ${new Date(expiresAt).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}`
        : `📅 <b>Exp:</b> Never (Lifetime)`;

      // Send key info to ALL admins
      await sendToAllAdmins(
        botToken,
        adminChatIds,
        `✅ <b>Key Generated for [${userName}]</b>\n\n🔑 <code>${key}</code>\n⏳ <b>Duration:</b> ${duration.label}\n${expLine}\n📱 <b>Max Devices:</b> ${maxDevices}\n\n<i>Key is ready to use!</i>`
      );

      return new Response("ok", { status: 200 });
    }

    // /list — show ALL keys (active + revoked)
    if (text.startsWith("/list")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: keys, error } = await supabase
        .from("access_keys")
        .select("key, label, active, expires_at, device_fingerprints")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Error: ${error.message}`);
        return new Response("ok", { status: 200 });
      }

      if (!keys || keys.length === 0) {
        await sendToAllAdmins(botToken, adminChatIds, "📭 No keys found.");
        return new Response("ok", { status: 200 });
      }

      const activeKeys = keys.filter(k => k.active);
      const revokedKeys = keys.filter(k => !k.active);

      const formatKey = (k: any, i: number) => {
        const devices = k.device_fingerprints?.length || 0;
        const exp = k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Lifetime";
        const status = k.active ? "✅" : "🚫";
        return `${i + 1}. ${status} <b>${k.label}</b>\n   <code>${k.key}</code>\n   📅 ${exp} | 📱 ${devices} device(s)`;
      };

      let msg = `📋 <b>All Keys (${keys.length})</b>\n\n`;
      
      if (activeKeys.length > 0) {
        msg += `<b>✅ Active (${activeKeys.length})</b>\n\n${activeKeys.map(formatKey).join("\n\n")}\n\n`;
      }
      
      if (revokedKeys.length > 0) {
        msg += `<b>🚫 Revoked (${revokedKeys.length})</b>\n\n${revokedKeys.map(formatKey).join("\n\n")}`;
      }

      await sendToAllAdmins(
        botToken,
        adminChatIds,
        msg.trim()
      );

      return new Response("ok", { status: 200 });
    }

    // /revoke <key>
    if (text.startsWith("/revoke")) {
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        await sendToAllAdmins(botToken, adminChatIds, "❌ Usage: <code>/revoke KEY-CODE</code>");
        return new Response("ok", { status: 200 });
      }
    }

    // /deliver <payment_id|key> <user_chat_id>  → re-send a generated key to user
    if (text.startsWith("/deliver") || text.startsWith("/send")) {
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        await sendToAllAdmins(
          botToken,
          adminChatIds,
          `❌ <b>Usage:</b>\n<code>/deliver pay_XXXX 123456789</code>\n<code>/deliver KEY-CODE-HERE 123456789</code>\n\nUser ka chat_id /admin/logs me Chat ID column me bhi dikhta hai jab user /start karta hai.`,
        );
        return new Response("ok", { status: 200 });
      }
      const ref = parts[1];
      const targetChat = parts[2];
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const isPayment = ref.startsWith("pay_");
      const { data: row } = await supabase
        .from("access_keys")
        .select("key, label, expires_at, telegram_chat_id, razorpay_payment_id")
        .eq(isPayment ? "razorpay_payment_id" : "key", isPayment ? ref : ref.toUpperCase())
        .maybeSingle();

      if (!row) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Not found: <code>${ref}</code>`);
        return new Response("ok", { status: 200 });
      }

      // Attach chat_id so user can also "I already paid" login
      await supabase
        .from("access_keys")
        .update({ telegram_chat_id: targetChat, updated_at: new Date().toISOString() })
        .eq("key", row.key);

      const expFmt = row.expires_at
        ? new Date(row.expires_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "Lifetime";

      const userMsg =
        `✅ <b>Your Access Key</b>\n\n` +
        `🔑 <code>${row.key}</code>\n` +
        `📅 <b>Valid till:</b> ${expFmt} IST\n\n` +
        `<i>👆 Tap the key to copy. App me paste karke login karo.</i>`;

      const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: targetChat, text: userMsg, parse_mode: "HTML" }),
      });
      const ok = sendRes.ok;
      await sendToAllAdmins(
        botToken,
        adminChatIds,
        ok
          ? `📨 <b>Delivered to user</b> <code>${targetChat}</code>\n\n🔑 <code>${row.key}</code>\n📅 ${expFmt}`
          : `❌ Send failed (${sendRes.status}). User ne shayad bot /start nahi kiya. Bolo: pehle bot pe /start bhejo, phir dobara try.`,
      );
      return new Response("ok", { status: 200 });
    }

    // Re-enter /revoke continuation
    if (text.startsWith("/revoke")) {
      const parts = text.split(/\s+/);

      const targetKey = parts[1].toUpperCase();
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: existing } = await supabase
        .from("access_keys")
        .select("key, label, active, expires_at")
        .eq("key", targetKey)
        .maybeSingle();

      if (!existing) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Key <code>${targetKey}</code> not found.`);
        return new Response("ok", { status: 200 });
      }

      if (!existing.active) {
        await sendToAllAdmins(botToken, adminChatIds, `⚠️ Key <code>${targetKey}</code> (${existing.label}) is already revoked.`);
        return new Response("ok", { status: 200 });
      }

      const { error } = await supabase
        .from("access_keys")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("key", targetKey);

      if (error) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Error: ${error.message}`);
      } else {
        const expLine = existing.expires_at 
          ? `📅 Expiry: ${new Date(existing.expires_at).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}`
          : `📅 Expiry: Lifetime`;
        // Send revoke notification to ALL admins
        await sendToAllAdmins(
          botToken,
          adminChatIds,
          `🚫 <b>Key Revoked!</b>\n\n🔑 <code>${targetKey}</code>\n👤 ${existing.label}\n${expLine}\n\n<i>This key is now deactivated.</i>`
        );
      }
      return new Response("ok", { status: 200 });
    }

    // /setapi <NEW_RAPIDAPI_KEY>
    if (text.startsWith("/setapi")) {
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !parts[1]) {
        await sendToAllAdmins(
          botToken,
          adminChatIds,
          `❌ <b>Usage:</b>\n<code>/setapi YOUR_NEW_RAPIDAPI_KEY</code>\n\n📌 New Gmail se RapidAPI account banao, Instagram120 API subscribe karo, key copy karke yahan bhejo.`
        );
        return new Response("ok", { status: 200 });
      }

      const newKey = parts.slice(1).join("").trim();
      if (newKey.length < 20) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Key bahut chhoti lag rahi hai. Sahi RapidAPI key bhejo.`);
        return new Response("ok", { status: 200 });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error } = await supabase
        .from("api_settings")
        .update({
          current_key: newKey,
          used_count: 0,
          alerted_warning: false,
          alerted_urgent: false,
          period_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ DB Error: ${error.message}`);
        return new Response("ok", { status: 200 });
      }

      const masked = newKey.length > 10
        ? `${newKey.slice(0, 6)}••••${newKey.slice(-4)}`
        : "••••";

      await sendToAllAdmins(
        botToken,
        adminChatIds,
        `✅ <b>NEW RAPIDAPI KEY ACTIVATED!</b>\n\n` +
        `🔑 <b>Key:</b> <code>${masked}</code>\n` +
        `📊 <b>Quota:</b> Reset to 0 / 500\n` +
        `🚀 <b>Status:</b> Live — users ab bina ruke search kar sakte hain.\n\n` +
        `<i>Purani key automatically replace ho gayi. Within ~30 sec sab edge instances naya key use karenge.</i>`
      );
      return new Response("ok", { status: 200 });
    }

    // /quota or /status — show current usage + flags
    if (text.startsWith("/quota") || text.startsWith("/status")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data, error } = await supabase
        .from("api_settings")
        .select("monthly_limit, used_count, period_start, current_key, alerted_warning, alerted_urgent, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) {
        await sendToAllAdmins(botToken, adminChatIds, `❌ Status fetch failed.`);
        return new Response("ok", { status: 200 });
      }
      const remaining = Math.max(0, (data.monthly_limit || 0) - (data.used_count || 0));
      const hasCustom = !!(data.current_key && data.current_key.length > 0);
      const keyMasked = hasCustom
        ? `${data.current_key!.slice(0, 6)}••••${data.current_key!.slice(-4)}`
        : "Default (env)";
      const pct = Math.round(((data.used_count || 0) / (data.monthly_limit || 1)) * 100);
      const barFilled = Math.min(10, Math.round(pct / 10));
      const bar = "█".repeat(barFilled) + "░".repeat(10 - barFilled);
      const warnFlag = data.alerted_urgent ? "🚨 URGENT SENT" : data.alerted_warning ? "⚠️ WARNING SENT" : "✅ Normal";
      await sendToAllAdmins(
        botToken,
        adminChatIds,
        `📊 <b>DARKSIDEX • API STATUS</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔑 <b>Active Key:</b> <code>${keyMasked}</code>\n` +
        `📦 <b>Source:</b> ${hasCustom ? "Custom (via /setapi)" : "Default env"}\n\n` +
        `🔢 <b>Used:</b> ${data.used_count} / ${data.monthly_limit} (${pct}%)\n` +
        `🟢 <b>Remaining:</b> ${remaining} searches\n` +
        `📈 <code>${bar}</code>\n\n` +
        `🚦 <b>Alert State:</b> ${warnFlag}\n` +
        `   • Warning flag: ${data.alerted_warning ? "🟡 ON" : "⚪ OFF"}\n` +
        `   • Urgent flag:  ${data.alerted_urgent ? "🔴 ON" : "⚪ OFF"}\n\n` +
        `📅 <b>Period start:</b> ${new Date(data.period_start).toLocaleString()}\n` +
        `🕒 <b>Last update:</b> ${new Date(data.updated_at).toLocaleString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Naya key bhejne ke liye:</i> <code>/setapi NEW_KEY</code>`
      );
      return new Response("ok", { status: 200 });
    }

    // /help or /start
    if (text.startsWith("/start") || text.startsWith("/help")) {
      const welcomeMsg =
        `🚀🚀🚀 <b>WELCOME TO DARKSIDEX</b> 🚀🚀🚀\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔥 <b>A NEW BEGINNING STARTS TODAY!</b> 🔥\n\n` +
        `👑 <b>BOTH ADMINS ARE NOW CONNECTED</b> 👑\n` +
        `💎 Every message, every key, every action —\n` +
        `   <b>BOTH OF YOU WILL SEE EVERYTHING.</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ <b>THE MISSION</b> ⚡\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💪 <b>WORK HARD. STAY UNITED. DOMINATE.</b>\n\n` +
        `🌟 With this hustle, by <b>2026</b> we will become\n` +
        `   <b>MILLIONAIRES TOGETHER!</b> 💰💰💰\n\n` +
        `🎯 Every key sold = one step closer\n` +
        `🎯 Every customer = one brick in our empire\n` +
        `🎯 Every day = a chance to grow stronger\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🤖 <b>DARKSIDEX KEY MANAGER</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>📌 Commands:</b>\n\n` +
        `🔑 <code>/gen name days [devices]</code>\n   Generate a new key\n\n` +
        `📋 <code>/list</code>\n   List all keys (active + revoked)\n\n` +
        `🚫 <code>/revoke KEY-CODE</code>\n   Deactivate a key\n\n` +
        `🔁 <code>/setapi NEW_RAPIDAPI_KEY</code>\n   Replace RapidAPI key (zero downtime)\n\n` +
        `📊 <code>/quota</code>\n   Show RapidAPI usage status\n\n` +
        `🔍 <code>/status</code>\n   Detailed key + quota + alert flags\n\n` +
        `<b>💡 Examples:</b>\n` +
        `<code>/gen Ahmed 7</code> → 7 days\n` +
        `<code>/gen Ali 30 2</code> → 30 days, 2 devices\n` +
        `<code>/gen VIP lifetime</code> → permanent\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔥 <b>LET'S BUILD THE EMPIRE!</b> 🔥\n` +
        `💎 <b>DARKSIDEX — TO THE MOON!</b> 🚀🌙\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      await sendToAllAdmins(botToken, adminChatIds, welcomeMsg);
      return new Response("ok", { status: 200 });
    }

    // Unknown command
    await sendToAllAdmins(botToken, adminChatIds, "🤔 Unknown command. Send /help for usage.");
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("ok", { status: 200 });
  }
});
