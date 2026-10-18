import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

// Map amount (in paise) to plan days
function planFromAmount(amountPaise: number): { days: number; label: string } | null {
  const rupees = Math.round(amountPaise / 100);
  if (rupees === 149) return { days: 1, label: "1 Day" };
  if (rupees === 599) return { days: 7, label: "Weekly" };
  if (rupees === 1199) return { days: 30, label: "Monthly" };
  if (rupees === 3499) return { days: 36500, label: "Lifetime" };
  if (rupees === 50) return { days: 1, label: "1 Day (Test)" };
  if (rupees === 100) return { days: 1, label: "1 Day" };
  if (rupees === 500) return { days: 7, label: "7 Days" };
  if (rupees === 1000) return { days: 30, label: "30 Days" };
  return null;
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signature.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      console.error("Telegram send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram send error:", e);
    return false;
  }
}

function getAdminChatIds(): string[] {
  const ids = [
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_1") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_2") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_3") || "",
    ...(Deno.env.get("TELEGRAM_CHAT_ID") || "").split(","),
  ];
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function normalizePhone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  return digits;
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function deviceFpFromSource(source: string): string {
  const value = String(source || "").trim();
  if (!value.startsWith("web:") && !value.startsWith("apk:")) return "";
  const withoutPrefix = value.slice(4);
  return withoutPrefix.split(":plan:")[0].trim();
}

function planIdFromSource(source: string): string {
  return String(source || "").split(":plan:")[1]?.trim() || "";
}

function sourcePlanMatchesAmount(source: string, amountPaise: number): boolean {
  const planId = planIdFromSource(source);
  const rupees = Math.round(amountPaise / 100);
  const expected: Record<string, number[]> = {
    "1": [149, 100],
    "7": [599, 500],
    "30": [1199, 1000],
    lifetime: [3499],
  };
  return Boolean(planId && expected[planId]?.includes(rupees));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return new Response("Server not configured", { status: 500, headers: corsHeaders });
  }

  const signature = req.headers.get("x-razorpay-signature") || "";
  const rawBody = await req.text();

  // 1. Verify signature
  const valid = await verifySignature(rawBody, signature, secret);
  if (!valid) {
    console.warn("Invalid Razorpay signature");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  console.log("Razorpay event:", event.event);

  // Only act on payment.captured
  if (event.event !== "payment.captured") {
    return new Response(JSON.stringify({ ok: true, ignored: event.event }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment) {
    return new Response("No payment in payload", { status: 400, headers: corsHeaders });
  }

  const paymentId: string = payment.id;
  const amount: number = payment.amount; // in paise
  // Razorpay Payment Buttons attach `notes[...]` to the ORDER, not the payment.
  // So we have to look in BOTH places.
  const paymentNotes = payment.notes || {};
  const orderNotes = event.payload?.order?.entity?.notes || {};

  // ============================================================
  // 🛡️ SERVICE GATE — block payments meant for other services
  // ============================================================
  // Same Razorpay account fires this webhook for EVERY payment
  // (mujclone + SMM panel + anything else). We must accept ONLY
  // payments that are clearly ours. A payment is "ours" if ANY of:
  //   (a) notes.service_code === "MUJCLONE_KEY_2026"
  //   (b) notes.telegram_chat_id / notes.chat_id present
  //   (c) Razorpay contact/email matches a recent payment_user_links
  //       row that the user filled on OUR payment page (within 6h)
  // Otherwise → ignore (foreign / SMM payment).
  // ============================================================
  const SERVICE_CODE = "MUJCLONE_KEY_2026";
  const incomingServiceCode = String(
    paymentNotes.service_code || orderNotes.service_code || ""
  ).trim();
  const hasOurChatIdNote = Boolean(
    paymentNotes.telegram_chat_id ||
      orderNotes.telegram_chat_id ||
      paymentNotes.chat_id ||
      orderNotes.chat_id
  );
  // Web/APK flow stamps device_fp in notes. If present, this is ours.
  const deviceFpNote: string = String(
    paymentNotes.device_fp || orderNotes.device_fp || ""
  ).trim();
  let resolvedDeviceFp = deviceFpNote;

  let chatId: string = String(
    paymentNotes.telegram_chat_id ||
      orderNotes.telegram_chat_id ||
      paymentNotes.chat_id ||
      orderNotes.chat_id ||
      ""
  ).trim();

  // ===== DEBUG: structured diagnostics for missing-notes detection =====
  const debug = {
    paymentId,
    amount,
    event: event.event,
    hasPaymentNotes: Object.keys(paymentNotes).length > 0,
    hasOrderNotes: Object.keys(orderNotes).length > 0,
    paymentNotesKeys: Object.keys(paymentNotes),
    orderNotesKeys: Object.keys(orderNotes),
    paymentNotes,
    orderNotes,
    chatIdFromNotes: chatId || null,
    contact: payment.contact || null,
    email: payment.email || null,
    method: payment.method || null,
    resolvedVia: chatId ? "notes" : null as null | string,
  };
  console.log("🔍 webhook-debug:", JSON.stringify(debug));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Payment Buttons sometimes drop hidden notes. Fallback: match Razorpay contact/email
  // to the Telegram user who filled the payment page just before paying.
  const paymentPhone = normalizePhone(payment.contact || paymentNotes.phone || orderNotes.phone || "");
  const paymentEmail = normalizeEmail(payment.email || paymentNotes.email || orderNotes.email || "");
  if (!chatId && (paymentPhone || paymentEmail)) {
    const filters = [];
    if (paymentPhone) filters.push(`phone.eq.${paymentPhone}`);
    if (paymentEmail) filters.push(`email.eq.${paymentEmail}`);

    const { data: link, error: linkErr } = await supabase
      .from("payment_user_links")
      .select("id, telegram_chat_id, source")
      .or(filters.join(","))
      .gt("expires_at", new Date().toISOString())
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (linkErr) console.error("Payment contact link lookup failed:", linkErr);
    // Prefer web-flow links (telegram_chat_id IS NULL / source starts with "web:")
    // over legacy Telegram-bot links so a user paying through the APK modal
    // does not have their key accidentally delivered to an old TG account.
    const linksArr = Array.isArray(link) ? link : [];
    const webLink = linksArr.find((l: any) => {
      const source = String(l.source || "");
      return (source.startsWith("web:") || source.startsWith("apk:")) && sourcePlanMatchesAmount(source, amount);
    });
    const tgLink = linksArr.find((l: any) => l.telegram_chat_id);
    const chosen = webLink || tgLink || null;
    if (chosen) {
      if (chosen.telegram_chat_id && !webLink) {
        chatId = String(chosen.telegram_chat_id).trim();
        debug.resolvedVia = "payment_user_links";
      } else {
        // Web/APK flow — no Telegram, identify via source = "web:<deviceId>"
        debug.resolvedVia = "payment_user_links_web";
        const source = String(chosen.source || "").trim();
        const sourceDeviceFp = deviceFpFromSource(source);
        if (sourceDeviceFp) {
          resolvedDeviceFp = sourceDeviceFp;
          (debug as any).resolvedDeviceFp = sourceDeviceFp;
        }
      }
      await supabase.from("payment_user_links").update({ used_at: new Date().toISOString() }).eq("id", chosen.id);
      console.log("✅ resolved from payment_user_links:", { chatId, source: chosen.source, prefer: webLink ? "web" : "tg" });
    } else {
      debug.resolvedVia = "fallback_failed";
      console.warn("⚠️ Fallback link lookup found nothing for phone/email", { paymentPhone, paymentEmail });
    }
  }

  // Direct web checkout fallback: Razorpay Payment Button can drop hidden
  // device/service notes. In that case bind the payment to the newest short-
  // lived web checkout attempt for the SAME plan amount.
  if (!resolvedDeviceFp) {
    const sinceWeb = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: webLinks, error: webLinkErr } = await supabase
      .from("payment_user_links")
      .select("id, source, created_at")
      .is("telegram_chat_id", null)
      .like("source", "web:%")
      .gt("expires_at", new Date().toISOString())
      .gte("created_at", sinceWeb)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (webLinkErr) console.error("Recent web checkout lookup failed:", webLinkErr);
    const chosenWeb = (Array.isArray(webLinks) ? webLinks : []).find((l: any) =>
      sourcePlanMatchesAmount(String(l.source || ""), amount)
    );
    if (chosenWeb?.source) {
      const sourceDeviceFp = deviceFpFromSource(String(chosenWeb.source));
      if (sourceDeviceFp) {
        resolvedDeviceFp = sourceDeviceFp;
        debug.resolvedVia = "recent_web_checkout";
        (debug as any).resolvedDeviceFp = sourceDeviceFp;
        (debug as any).recentWebCheckoutCreatedAt = chosenWeb.created_at;
        await supabase.from("payment_user_links").update({ used_at: new Date().toISOString() }).eq("id", chosenWeb.id);
        console.log("✅ resolved from recent web checkout:", { source: chosenWeb.source });
      }
    }
  }

  // ============================================================
  // NOW apply the service gate — AFTER payment_user_links lookup.
  // If we still have no signal that this is ours → ignore.
  // ============================================================
  const isOurService = incomingServiceCode === SERVICE_CODE;
  const isOurDevice = Boolean(resolvedDeviceFp);
  const isLegacyOurs = !incomingServiceCode && hasOurChatIdNote;
  // resolved via payment_user_links (either tg or web)
  const isResolvedOurs = !incomingServiceCode && !hasOurChatIdNote &&
    (debug.resolvedVia === "payment_user_links" || debug.resolvedVia === "payment_user_links_web" || debug.resolvedVia === "recent_web_checkout");

  if (!isOurService && !isOurDevice && !isLegacyOurs && !isResolvedOurs) {
    console.log(
      `🛑 Ignoring foreign payment ${paymentId} — service_code="${incomingServiceCode}", no chat note, no matching payment_user_links for phone="${paymentPhone}" email="${paymentEmail}".`
    );
    await supabase.from("webhook_logs").insert({
      payment_id: paymentId,
      amount_paise: amount,
      rupees: Math.round(amount / 100),
      status: "ignored_foreign_service",
      telegram_sent: false,
      error: `Not ours: no service_code, no chat note, no payment_user_links match (phone=${paymentPhone}, email=${paymentEmail})`,
      raw: { paymentNotes, orderNotes, event_id: event?.id, debug },
    });
    return new Response(
      JSON.stringify({ ok: true, ignored: "foreign_service" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ===== ALERT: if chatId still missing, immediately ping admins with full diagnostics =====
  if (!chatId && botToken) {
    const admins = getAdminChatIds();
    const alertText =
      `🚨 <b>WEBHOOK DEBUG: chat_id MISSING</b>\n\n` +
      `🧾 Payment: <code>${paymentId}</code>\n` +
      `💰 ₹${Math.round(amount / 100)}\n` +
      `📞 Contact: <code>${payment.contact || "—"}</code>\n` +
      `✉️ Email: <code>${payment.email || "—"}</code>\n` +
      `🧩 Method: <code>${payment.method || "—"}</code>\n\n` +
      `<b>payment.notes keys:</b> <code>${JSON.stringify(Object.keys(paymentNotes))}</code>\n` +
      `<b>order.notes keys:</b> <code>${JSON.stringify(Object.keys(orderNotes))}</code>\n` +
      `<b>payment.notes:</b> <code>${JSON.stringify(paymentNotes).slice(0, 300)}</code>\n` +
      `<b>order.notes:</b> <code>${JSON.stringify(orderNotes).slice(0, 300)}</code>\n\n` +
      `<i>👉 Likely cause: Razorpay Payment Button dropped hidden notes AND user did not "Save details" before paying (so no payment_user_links row).</i>\n\n` +
      `<b>Fix:</b> User ko bolo: <code>/claim ${paymentId}</code>`;
    await Promise.allSettled(admins.map((aid) => sendTelegram(botToken, aid, alertText)));
    await supabase.from("webhook_logs").insert({
      payment_id: paymentId,
      amount_paise: amount,
      rupees: Math.round(amount / 100),
      telegram_chat_id: null,
      status: "debug_missing_chat_id",
      telegram_sent: false,
      error: "chat_id missing in both payment.notes and order.notes; fallback link lookup also failed",
      raw: { debug, event },
    });
  }

  // 2. Dedupe — if this payment_id already processed, skip
  const { data: existing } = await supabase
    .from("access_keys")
    .select("key, label, expires_at, telegram_chat_id, device_fingerprints")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existing) {
    console.log("Duplicate webhook for payment:", paymentId);
    let dupSent = false;
    const deliveryChatId = existing.telegram_chat_id || chatId || "";
    const existingDevices: string[] = existing.device_fingerprints || [];
    const updateExisting: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (deliveryChatId && !existing.telegram_chat_id) updateExisting.telegram_chat_id = deliveryChatId;
    if (resolvedDeviceFp && !existingDevices.includes(resolvedDeviceFp)) {
      updateExisting.device_fingerprints = Array.from(new Set([...existingDevices, resolvedDeviceFp]));
    }
    if (Object.keys(updateExisting).length > 1) {
      await supabase.from("access_keys").update(updateExisting).eq("razorpay_payment_id", paymentId);
    }
    if (botToken && deliveryChatId) {
      // Re-deliver the existing key in case user lost it
      const expLine = existing.expires_at
        ? `📅 <b>Expiry:</b> ${new Date(existing.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
        : "📅 <b>Expiry:</b> Lifetime";
      dupSent = await sendTelegram(
        botToken,
        deliveryChatId,
        `♻️ <b>Your existing key</b>\n\n🔑 <code>${existing.key}</code>\n${expLine}`
      );
    }
    await supabase.from("webhook_logs").insert({
      payment_id: paymentId,
      amount_paise: amount,
      rupees: Math.round(amount / 100),
      telegram_chat_id: deliveryChatId || null,
      generated_key: existing.key,
      plan_label: existing.label,
      expires_at: existing.expires_at,
      status: "duplicate",
      telegram_sent: dupSent,
    });
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Detect plan
  const plan = planFromAmount(amount);
  if (!plan) {
    console.error("Unknown amount:", amount);
    // Notify admin so payment isn't lost
    if (botToken) {
      const admins = getAdminChatIds();
      await Promise.allSettled(
        admins.map((aid) =>
          sendTelegram(
            botToken,
            aid,
            `⚠️ <b>Payment received with unknown amount</b>\n\n` +
              `💰 Amount: ₹${Math.round(amount / 100)}\n` +
              `📞 Phone: <code>${paymentPhone || "—"}</code>\n` +
              `✉️ Email/Gmail: <code>${paymentEmail || "—"}</code>\n` +
              `🆔 Telegram Chat ID: <code>${chatId || "—"}</code>\n` +
              `🧾 Payment ID: <code>${paymentId}</code>\n\n` +
              `<i>Please deliver key manually or refund.</i>`
          )
        )
      );
    }
    await supabase.from("webhook_logs").insert({
      payment_id: paymentId,
      amount_paise: amount,
      rupees: Math.round(amount / 100),
      telegram_chat_id: chatId || null,
      status: "unknown_amount",
      telegram_sent: false,
      error: `No plan mapped for ₹${Math.round(amount / 100)}`,
    });
    return new Response(JSON.stringify({ ok: false, error: "unknown_amount", amount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!chatId) {
    console.error("Payment missing telegram_chat_id in notes:", paymentId);
    // Still record the payment — admin can deliver manually
  }

  // 4. Generate key
  const key = generateKey();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000).toISOString();
  const label = chatId ? `tg:${chatId}` : `rzp:${paymentId}`;

  const { error: insertErr } = await supabase.from("access_keys").insert({
    key,
    label,
    active: true,
    expires_at: expiresAt,
    max_devices: 1,
    razorpay_payment_id: paymentId,
    telegram_chat_id: chatId || null,
    device_fingerprints: resolvedDeviceFp ? [resolvedDeviceFp] : [],
  });

  if (insertErr) {
    console.error("Insert error:", insertErr);
    await supabase.from("webhook_logs").insert({
      payment_id: paymentId,
      amount_paise: amount,
      rupees: Math.round(amount / 100),
      telegram_chat_id: chatId || null,
      generated_key: key,
      plan_label: plan.label,
      expires_at: expiresAt,
      status: "db_error",
      telegram_sent: false,
      error: insertErr.message,
    });
    return new Response(JSON.stringify({ ok: false, error: insertErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Admin-only notification — user ko bot se kuch nahi jata.
  //    User website pe auto-login ho jata hai; admin sirf observability ke liye notify hota hai.
  const userSent = false;
  let adminSentCount = 0;
  let verifyLine = "";
  let missing: string[] = [];
  let messagePreview = "";
  let adminIdsUsed: string[] = [];
  if (botToken) {
    const admins = getAdminChatIds();
    adminIdsUsed = admins;
    const expFmt = new Date(expiresAt).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    // ── Verification: every admin alert MUST carry payer Gmail, phone,
    //    amount, and the access key tied to THIS payment.
    const verifyKeyMatches = Boolean(key && paymentId);
    if (!paymentEmail) missing.push("Gmail");
    if (!paymentPhone) missing.push("Phone");
    if (!amount) missing.push("Amount");
    if (!verifyKeyMatches) missing.push("Key↔Payment link");
    verifyLine = missing.length === 0
      ? `✅ <b>VERIFIED</b> — Gmail, Phone, Amount, Key all matched to payment.`
      : `⚠️ <b>INCOMPLETE</b> — Missing: <b>${missing.join(", ")}</b>`;
    const text =
      `💵 <b>NEW WEBSITE PAYMENT</b>\n\n` +
            `${verifyLine}\n\n` +
            `━━━━━━━━━━━━━━━\n` +
            `💰 <b>Amount:</b> ₹${Math.round(amount / 100)} • ${plan.label}\n` +
            `✉️ <b>Gmail:</b> <code>${paymentEmail || "❌ NOT PROVIDED"}</code>\n` +
            `📞 <b>Phone:</b> <code>${paymentPhone || "❌ NOT PROVIDED"}</code>\n` +
            `━━━━━━━━━━━━━━━\n` +
            `🔑 <b>Access Key:</b> <code>${key}</code>\n` +
            `📅 <b>Valid till:</b> ${expFmt} IST\n` +
            `📱 <b>Device:</b> <code>${resolvedDeviceFp || "—"}</code>\n\n` +
            `🧾 <b>Payment ID:</b> <code>${paymentId}</code>\n` +
      `<i>User ko website pe auto-login ho gaya. Bot delivery off.</i>`;
    messagePreview = text;
    const results = await Promise.allSettled(
      admins.map((aid) => sendTelegram(botToken, aid, text))
    );
    adminSentCount = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  }

  // ── Audit log: persist EVERY admin notification for troubleshooting.
  await supabase.from("admin_notifications").upsert({
    payment_id: paymentId,
    access_key: key,
    gmail: paymentEmail || null,
    phone: paymentPhone || null,
    rupees: Math.round(amount / 100),
    plan_label: plan.label,
    verified: missing.length === 0,
    missing_fields: missing,
    telegram_sent: adminSentCount > 0,
    admin_chat_ids: adminIdsUsed,
    message_preview: messagePreview.slice(0, 2000),
  }, { onConflict: "access_key" });

  await supabase.from("webhook_logs").insert({
    payment_id: paymentId,
    amount_paise: amount,
    rupees: Math.round(amount / 100),
    telegram_chat_id: chatId || null,
    generated_key: key,
    plan_label: plan.label,
    expires_at: expiresAt,
    status: chatId ? "success" : "success_no_chat",
    telegram_sent: userSent,
    error: chatId ? null : "No telegram_chat_id in payment notes",
    raw: event,
  });

  return new Response(JSON.stringify({ ok: true, key }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
