import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getTelegramChatId, getTelegramUser, isInTelegram, initTelegramApp } from "@/lib/telegram";
import { saveAuthSession, getDeviceFingerprint } from "@/lib/auth";
import HelpSheet from "@/components/HelpSheet";

// Razorpay Payment Button IDs (Razorpay Dashboard → Payment Button me banaye)
const BUTTONS = {
  "1": { id: "pl_Szngac4ikm4EcE", price: 100, label: "1 Day Access", days: 1 },
  "7": { id: "", price: 500, label: "7 Days Access", days: 7 }, // Add 500 button ID later
  "30": { id: "", price: 1000, label: "30 Days Access", days: 30 }, // Add 1000 button ID later
} as const;

function RazorpayButton({
  buttonId,
  chatId,
  plan,
}: {
  buttonId: string;
  chatId: string;
  plan: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!formRef.current || !buttonId) return;
    // Remove any old script (in case of re-render)
    formRef.current.innerHTML = "";

    const chatInput = document.createElement("input");
    chatInput.type = "hidden";
    chatInput.name = "notes[telegram_chat_id]";
    chatInput.value = chatId;
    formRef.current.appendChild(chatInput);

    const planInput = document.createElement("input");
    planInput.type = "hidden";
    planInput.name = "notes[plan_days]";
    planInput.value = plan;
    formRef.current.appendChild(planInput);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/payment-button.js";
    script.async = true;
    script.dataset.payment_button_id = buttonId;
    formRef.current.appendChild(script);
  }, [buttonId, chatId, plan]);

  return <form ref={formRef} className="flex justify-center" />;
}

export default function PaymentPage() {
  const [params] = useSearchParams();
  const tgChatId = getTelegramChatId();
  const chatId = params.get("chat_id") || tgChatId || "";
  const tgUser = getTelegramUser();
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [checkStatus, setCheckStatus] = useState<"idle" | "success" | "not_found" | "error">("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    initTelegramApp();
    if (!chatId) {
      setError("Open this page from the Telegram bot (/buy) or inside the Mini App.");
    }
  }, [chatId]);

  async function savePaymentContact() {
    if (!chatId || savingContact) return;
    setSavingContact(true);
    setContactMsg("");
    setContactSaved(false);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-payment-contact`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ telegram_chat_id: chatId, phone, email }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Details save nahi hui");
      setContactSaved(true);
      setContactMsg("✅ Details saved. Ab same phone/email se payment karo — key automatic Telegram pe aa jayegi.");
    } catch (e) {
      setContactMsg(`❌ ${e instanceof Error ? e.message : "Details save nahi hui"}`);
    } finally {
      setSavingContact(false);
    }
  }

  async function checkMyKey() {
    if (!chatId) return;
    const initData = window.Telegram?.WebApp?.initData || "";
    if (!initData) {
      setChecking(false);
      setCheckStatus("not_found");
      setCheckMsg("Open this page inside the Telegram Mini App to check your key.");
      return;
    }
    setChecking(true);
    setCheckMsg("");
    setCheckStatus("idle");
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tg-get-key`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ init_data: initData }),
      });
      const data = await res.json();
      if (data?.found && data.key) {
        const saved = saveAuthSession({
          key: data.key,
          deviceFingerprint: getDeviceFingerprint(),
          loginAt: new Date().toISOString(),
        });
        if (!saved) {
          setCheckStatus("not_found");
          setCheckMsg("");
          return;
        }
        setCheckStatus("success");
        setCheckMsg("Active key mil gayi — login ho rahe ho…");
        setTimeout(() => {
          window.location.href = "/";
        }, 600);
      } else {
        setCheckStatus("not_found");
        setCheckMsg("");
      }
    } catch (e) {
      setCheckStatus("error");
      setCheckMsg("Network issue. Thodi der baad try karo.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 relative">
          <button
            onClick={() => setHelpOpen(true)}
            className="absolute right-0 top-0 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition"
          >
            ❓ Help
          </button>
          <h1 className="text-2xl font-bold text-foreground mb-2">🔑 Get Access Key</h1>
          <p className="text-sm text-muted-foreground">
            {isInTelegram() && tgUser?.first_name
              ? `Hi ${tgUser.first_name}! Choose a plan.`
              : "Choose a plan. Payment ke baad key Telegram bot pe mil jayegi."}
          </p>
          {chatId && (
            <p className="text-xs text-muted-foreground mt-2">
              Telegram ID: <code className="bg-muted px-2 py-0.5 rounded">{chatId}</code>
            </p>
          )}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive text-center">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
              <div>
                <div className="font-semibold text-foreground">Payment details link karo</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Razorpay me jo phone/email use karoge wahi yaha daalo, tab key user ko automatic milegi.
                </p>
              </div>
              <div className="grid gap-2">
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setContactSaved(false);
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Phone number"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setContactSaved(false);
                  }}
                  inputMode="email"
                  placeholder="Email (optional)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={savePaymentContact}
                disabled={savingContact || (!phone.trim() && !email.trim())}
                className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90 disabled:opacity-50 transition"
              >
                {savingContact ? "Saving…" : contactSaved ? "✅ Details saved" : "Save details before payment"}
              </button>
              {contactMsg && <p className="text-xs text-muted-foreground leading-relaxed">{contactMsg}</p>}
            </div>

            {Object.entries(BUTTONS).map(([plan, info]) => (
              <div
                key={plan}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-foreground">{info.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Valid for {info.days} day{info.days > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-foreground">₹{info.price}</div>
                </div>
                {info.id && contactSaved ? (
                  <RazorpayButton buttonId={info.id} chatId={chatId} plan={plan} />
                ) : info.id ? (
                  <div className="text-center text-xs text-muted-foreground py-3 border border-dashed rounded-lg">
                    Pehle phone/email save karo
                  </div>
                ) : (
                  <div className="text-center text-xs text-muted-foreground py-3 border border-dashed rounded-lg">
                    Coming soon
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={checkMyKey}
              disabled={checking}
              className="w-full rounded-xl border border-primary/40 bg-primary/10 text-primary font-semibold py-3 text-sm hover:bg-primary/20 disabled:opacity-50 transition"
            >
              {checking ? "Checking…" : "✅ I already paid — log me in"}
            </button>

            {checkStatus === "success" && checkMsg && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium">
                ✅ {checkMsg}
              </div>
            )}

            {checkStatus === "not_found" && (
              <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 text-center space-y-2">
                <div className="text-2xl">⚠️</div>
                <div className="text-sm font-bold text-amber-700 dark:text-amber-400">
                  Abhi tak payment nahi hua
                </div>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                  Tumhari Telegram ID <code className="bg-amber-500/20 px-1 rounded">{chatId}</code> ke liye koi active key nahi mili.
                  <br />
                  <span className="font-semibold">Pehle upar koi plan select karke pay karo,</span> phir ye button dabao.
                </p>
                <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70 pt-1">
                  Already pay kar diya? 30 second wait karke dobara try karo — webhook process hone me time lagta hai.
                </p>
              </div>
            )}

            {checkStatus === "error" && checkMsg && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive text-center">
                ❌ {checkMsg}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center mt-6 leading-relaxed">
          Secure payment by Razorpay. Key auto-deliver via Telegram bot after successful payment.
        </p>

        <button
          onClick={() => setHelpOpen(true)}
          className="block mx-auto mt-3 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          Pehli baar use kar rahe ho? Step-by-step guide dekho →
        </button>
      </div>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
