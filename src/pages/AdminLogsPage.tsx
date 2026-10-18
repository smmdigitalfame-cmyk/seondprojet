import { useEffect, useState } from "react";

interface LogRow {
  id: string;
  payment_id: string | null;
  amount_paise: number | null;
  rupees: number | null;
  telegram_chat_id: string | null;
  generated_key: string | null;
  plan_label: string | null;
  expires_at: string | null;
  status: string;
  telegram_sent: boolean;
  error: string | null;
  created_at: string;
}

const TOKEN_KEY = "darksidex_admin_token";

export default function AdminLogsPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function fetchLogs(tok: string) {
    setLoading(true);
    setError("");
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-logs?limit=100`;
      const res = await fetch(url, {
        headers: {
          "x-admin-token": tok,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setLogs(data.logs || []);
      localStorage.setItem(TOKEN_KEY, tok);
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message || "Failed to load logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) fetchLogs(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })
      : "—";

  const statusColor = (s: string) => {
    if (s === "success") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    if (s === "duplicate") return "bg-blue-500/15 text-blue-600 border-blue-500/30";
    if (s === "success_no_chat") return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    return "bg-red-500/15 text-red-600 border-red-500/30";
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">🛡️ Webhook Logs</h1>
            <p className="text-sm text-muted-foreground">
              Razorpay payments + key generation + Telegram delivery status
            </p>
          </div>
          <button
            onClick={() => fetchLogs(token)}
            disabled={loading || !token}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Loading…" : "🔄 Refresh"}
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token (your Telegram admin chat id)"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            onClick={() => fetchLogs(token)}
            disabled={!token || loading}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Unlock
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loaded && logs.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No webhook events yet. Make a test payment to see logs here.
          </div>
        )}

        <div className="space-y-3">
          {logs.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusColor(l.status)}`}
                  >
                    {l.status}
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    ₹{l.rupees ?? "—"}
                  </span>
                  {l.plan_label && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {l.plan_label}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded ${l.telegram_sent ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}
                  >
                    {l.telegram_sent ? "📨 TG sent" : "❌ TG not sent"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{fmt(l.created_at)}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Payment ID:</span>{" "}
                  <code className="font-mono text-foreground">{l.payment_id || "—"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Chat ID:</span>{" "}
                  <code className="font-mono text-foreground">{l.telegram_chat_id || "—"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Key:</span>{" "}
                  <code className="font-mono text-foreground">{l.generated_key || "—"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Expires:</span>{" "}
                  <span className="text-foreground">{fmt(l.expires_at)}</span>
                </div>
              </div>

              {l.error && (
                <div className="mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
                  ⚠️ {l.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}