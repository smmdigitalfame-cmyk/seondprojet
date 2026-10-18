import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: "1️⃣",
    title: "Plan choose karo",
    body: "₹100 (1 day), ₹500 (7 days) ya ₹1000 (30 days) me se apna plan select karo.",
  },
  {
    icon: "2️⃣",
    title: "Razorpay se pay karo",
    body: "Button dabate hi Razorpay popup khulega. UPI / PhonePe / GPay / Card — kuch bhi use kar sakte ho.",
  },
  {
    icon: "3️⃣",
    title: "Telegram pe key milegi",
    body: "Payment success hote hi 5–30 second me bot pe message aayega:\n✅ Payment Successful\n🔑 XXXX-XXXX-XXXX",
  },
  {
    icon: "4️⃣",
    title: "Auto login",
    body: "Wapas Mini App me aake \"✅ I already paid — log me in\" dabao. App khul jayegi — koi key copy-paste karne ki zarurat nahi.",
  },
  {
    icon: "5️⃣",
    title: "Plan expire hone par",
    body: "Expiry ke baad app lock ho jayegi. Dobara Mini App kholo aur naya plan le lo — purani key se duplicate charge nahi hoga.",
  },
];

const FAQ = [
  {
    q: "Payment ho gaya but Telegram pe key nahi aayi?",
    a: "30 second wait karo. Phir bhi na aaye to \"I already paid — log me in\" button dabao, auto-login ho jayega.",
  },
  {
    q: "Doosre device pe login kar sakte hai?",
    a: "Nahi. Ek key sirf 1 device par chalegi (security ke liye).",
  },
  {
    q: "Refund milega?",
    a: "Digital access key hai — payment ke baad refund possible nahi. Issue ho to admin se contact karo.",
  },
  {
    q: "Chat ID kaise milegi?",
    a: "Tumhari Telegram ID automatic detect ho jati hai Mini App me. Manually kuch nahi karna.",
  },
];

export default function HelpSheet({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        {/* Drag handle (mobile) */}
        <div className="sticky top-0 bg-card pt-3 pb-2 border-b border-border/40 z-10">
          <div className="mx-auto h-1 w-10 rounded-full bg-muted sm:hidden mb-3" />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-lg font-bold text-foreground">📖 Kaise use kare</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="rounded-xl border border-border bg-background/50 p-4 flex gap-3"
              >
                <span className="text-2xl shrink-0">{s.icon}</span>
                <div>
                  <div className="font-semibold text-foreground text-sm">{s.title}</div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-2">❓ FAQ</h3>
            <div className="space-y-2">
              {FAQ.map((f) => (
                <details
                  key={f.q}
                  className="rounded-lg border border-border bg-background/50 px-3 py-2 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="cursor-pointer text-xs font-semibold text-foreground flex items-center justify-between gap-2">
                    <span>{f.q}</span>
                    <span className="text-muted-foreground">＋</span>
                  </summary>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          {/* Support */}
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
            <p className="text-xs text-foreground font-medium mb-1">Aur help chahiye?</p>
            <p className="text-[11px] text-muted-foreground">
              Bot me <code className="bg-muted px-1 rounded">/support</code> bhejo — admin reply karega.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90 transition"
          >
            Got it 👍
          </button>
        </div>
      </div>
    </div>
  );
}