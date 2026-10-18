Deno.serve(async () => {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const ids = [
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_1") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_2") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_3") || "",
    ...(Deno.env.get("TELEGRAM_CHAT_ID") || "").split(","),
  ];
  const adminChatIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

  const results = await Promise.allSettled(
    adminChatIds.map((id) =>
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: id,
          parse_mode: "HTML",
          text: "✅ <b>Telegram Bot Setup Complete</b>\n\nWebhook registered successfully. Bot is live.",
        }),
      })
    )
  );

  return new Response(
    JSON.stringify({ sent_to: adminChatIds, results }, null, 2),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
