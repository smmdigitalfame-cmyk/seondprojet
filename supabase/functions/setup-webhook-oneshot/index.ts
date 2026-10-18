Deno.serve(async () => {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "edited_message"] }),
  });
  const data = await res.json();
  return new Response(JSON.stringify({ webhookUrl, telegram: data }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});