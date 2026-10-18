import { useEffect, useRef, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { saveAuthSession, getDeviceFingerprint } from "@/lib/auth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type Plan = { id: string; days: number; price: number; label: string; buttonId: string };

export const PLANS: Plan[] = [
  { id: "1", days: 1, price: 199, label: "1 Day", buttonId: "pl_Szret3tn4QzNRk" },
  { id: "7", days: 7, price: 999, label: "Weekly", buttonId: "pl_Szri1mlLfjfYNQ" },
  { id: "30", days: 30, price: 2999, label: "Monthly", buttonId: "pl_SzrivSopG1M4nG" },
  { id: "lifetime", days: 36500, price: 5999, label: "Lifetime", buttonId: "pl_SzrjjgYhh9IYqD" },
];

export function RazorpayButton({ buttonId, deviceFp }: { buttonId: string; deviceFp: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const mountedKey = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!formRef.current || !buttonId) return;
    const key = `${buttonId}::${deviceFp}`;
    if (mountedKey.current === key) return; // already mounted, don't re-init
    mountedKey.current = key;
    formRef.current.innerHTML = "";
    setReady(false);
    setLoadError(false);
    // Hidden notes — Razorpay forwards these on the order/payment.
    // device_fp lets webhook match payment → this device without phone/email.
    const noteFields: Array<[string, string]> = [
      ["notes[device_fp]", deviceFp],
      ["notes[service_code]", "MUJCLONE_KEY_2026"],
    ];
    for (const [name, value] of noteFields) {
      const inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = name;
      inp.value = value;
      formRef.current.appendChild(inp);
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/payment-button.js";
    script.async = true;
    script.dataset.payment_button_id = buttonId;
    script.onload = () => setReady(true);
    script.onerror = () => setLoadError(true);
    formRef.current.appendChild(script);
    // Poll for the injected button element — Razorpay injects it after
    // script load, so flip `ready` as soon as we see it in the DOM.
    const start = Date.now();
    const iv = window.setInterval(() => {
      if (!formRef.current) return;
      if (formRef.current.querySelector("button, iframe, input[type='submit'], input[type='button'], a, .razorpay-payment-button")) {
        setReady(true);
        window.clearInterval(iv);
      } else if (Date.now() - start > 10000) {
        setLoadError(true);
        window.clearInterval(iv);
      }
    }, 150);
    return () => window.clearInterval(iv);
  }, [buttonId, deviceFp]);
  return (
    <div className="relative min-h-[60px]">
      {!ready && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100 animate-pulse">
          <span className="text-xs text-slate-500">Loading payment button…</span>
        </div>
      )}
      {loadError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 text-center">
          Payment button load nahi hua. Internet check karke page refresh karein.
        </div>
      )}
      <form ref={formRef} className="flex justify-center items-center min-h-[60px]" />
    </div>
  );
}

export default function PaymentModal({
  open,
  onClose,
  onSuccess,
  initialPlanId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPlanId?: string;
}) {
  const [step, setStep] = useState<"plan" | "pay" | "success">("plan");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [autoStatus, setAutoStatus] = useState<"idle" | "watching" | "found">("idle");
  const pollRef = useRef<number | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const paymentStartedRef = useRef("");
  const deviceFp = useRef<string>("");
  if (!deviceFp.current) deviceFp.current = getDeviceFingerprint();
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (!open) {
      setStep(initialPlanId ? "pay" : "plan");
      setSelectedPlan(null);
      setError("");
      setAutoStatus("idle");
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } else {
      if (initialPlanId) {
        const p = PLANS.find((x) => x.id === initialPlanId);
        if (p && p.buttonId) {
          setSelectedPlan(p);
          paymentStartedRef.current = new Date().toISOString();
          setStep("pay");
        }
      }
    }
  }, [open, initialPlanId]);

  // Auto-watch for payment as soon as user is on the "pay" step.
  // Polls claim-key-by-phone with device_fp — moment webhook drops the key
  // for THIS device, we detect → save session → auto-login.
  useEffect(() => {
    if (step !== "pay") return;
    const fp = deviceFp.current;
    if (!fp) return;
    setAutoStatus("watching");
    let attempts = 0;
    const tick = async () => {
      attempts++;
      if (attempts > 100) {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setAutoStatus("idle");
        return;
      }
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-key-by-phone`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ device_fp: fp, created_after: paymentStartedRef.current }),
        });
        const data = await res.json();
        if (data?.found && data.key) {
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setAutoStatus("found");
          const saved = saveAuthSession({
            key: data.key,
            deviceFingerprint: fp,
            loginAt: new Date().toISOString(),
          });
          if (saved) {
            setStep("success");
            setTimeout(() => onSuccessRef.current(), 900);
          } else {
            setAutoStatus("idle");
            setError("Aapne is key se logout kar diya tha. Dobara login ke liye new subscription lena hoga.");
            setStep("plan");
          }
        }
      } catch {
        // keep polling
      }
    };
    // first check after 2s, then every 3s
    const first = window.setTimeout(tick, 2000);
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      window.clearTimeout(first);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step]);

  function selectPlan(plan: Plan) {
    setError("");
    if (!plan.buttonId) {
      setError("This plan is not active yet. Try 1 Day plan or contact support.");
      return;
    }
    setSelectedPlan(plan);
    paymentStartedRef.current = new Date().toISOString();
    setStep("pay");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      style={{ background: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {step === "plan" && "Choose Your Plan"}
            {step === "pay" && `Pay ₹${selectedPlan?.price}`}
            {step === "success" && "Logging you in..."}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-slate-100 transition"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === "plan" && (
            <>
              <p className="text-sm text-slate-600">
                Plan select karo. Payment ke turant baad auto-login ho jayega — ye device hi unlock hoga.
              </p>

              <div className="space-y-2.5">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => selectPlan(plan)}
                    disabled={!plan.buttonId}
                    className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-left">
                      <div className="font-bold text-slate-900">{plan.label}</div>
                      <div className="text-xs text-slate-500">
                        Valid for {plan.days} day{plan.days > 1 ? "s" : ""}
                        {!plan.buttonId && " · Coming soon"}
                      </div>
                    </div>
                    <div className="text-xl font-bold text-blue-600">₹{plan.price}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
                🔒 Key ye device se hi lock hogi (Device ID: <code className="bg-white px-1 rounded">{deviceFp.current}</code>). Doosre device pe login nahi chalega.
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}
            </>
          )}

          {step === "pay" && selectedPlan && (
            <>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {selectedPlan.label}
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    ₹{selectedPlan.price}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  Device: <code className="bg-white px-1.5 py-0.5 rounded">{deviceFp.current}</code>
                </div>
              </div>

              <div className="text-xs text-slate-600 text-center">
                Razorpay button dabao → payment karo → app yahin auto-login ho jayega.
              </div>

              <RazorpayButton buttonId={selectedPlan.buttonId} deviceFp={deviceFp.current} />

              {autoStatus === "watching" && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <Loader2 size={16} className="text-amber-600 animate-spin" />
                  <span className="text-xs font-medium text-amber-800">
                    Auto-detecting payment... payment hote hi turant login ho jayega.
                  </span>
                </div>
              )}

              <button
                onClick={() => setStep("plan")}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                ← Change plan
              </button>
            </>
          )}

          {step === "success" && (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                <Check size={36} className="text-white" strokeWidth={3} />
              </div>
              <p className="text-base font-bold text-slate-900">Payment Verified!</p>
              <p className="text-xs text-slate-500">Key mil gayi — auto-login ho raha hai...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}