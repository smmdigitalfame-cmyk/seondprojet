import { useEffect, useRef } from "react";
import { getDeviceFingerprint, clearAuthSession, getAuthSession } from "@/lib/auth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function KeyGuard({ children }: { children: React.ReactNode }) {
    const failCountRef = useRef(0);
    const lastCheckRef = useRef<number>(0);
    const expiryTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let mounted = true;

        const checkKey = async (force = false) => {
            // Throttle background checks, but keep expiry/logout enforcement prompt.
            const now = Date.now();
            if (!force && now - lastCheckRef.current < 60 * 1000) return;
            // Skip when tab not visible — saves massive load at scale
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            lastCheckRef.current = now;

            const session = getAuthSession();
            if (!session) {
                clearAuthSession();
                if (window.location.pathname !== "/") {
                    window.location.href = "/";
                }
                return;
            }

            try {
                const currentFingerprint = session.deviceFingerprint || getDeviceFingerprint();

                const res = await fetch(`${SUPABASE_URL}/functions/v1/check-key-status`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                        key: session.key,
                        deviceFingerprint: currentFingerprint
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                const data = await res.json().catch(() => ({}));

                if (!mounted) return;

                // Log out exactly when the key's validity period ends.
                if (res.ok && data?.expires_at) {
                    const ms = new Date(data.expires_at).getTime() - Date.now();
                    if (expiryTimerRef.current) window.clearTimeout(expiryTimerRef.current);
                    if (ms <= 0) {
                        clearAuthSession();
                        window.location.href = "/";
                        return;
                    }
                    if (ms < 2 ** 31 - 1) {
                        expiryTimerRef.current = window.setTimeout(() => checkKey(true), ms + 1000);
                    }
                }

                if (!res.ok) {
                    // A device mismatch, rate limit, lookup failure, or temporary
                    // backend error must never destroy a paid user's session.
                    // Logout only when the server explicitly identifies the key
                    // itself as invalid, revoked, or past its stored expiry.
                    const rejectionCode = String(data?.code || "");
                    const definitiveFailure = ["invalid_key", "deactivated", "expired"].includes(rejectionCode);
                    if (definitiveFailure) {
                        console.log(`[KeyGuard] Key ${rejectionCode} — logging out`);
                        clearAuthSession();
                        window.location.href = "/";
                        return;
                    } else {
                        console.log("[KeyGuard] Non-expiry validation error, staying logged in.");
                    }
                }
            } catch (err) {
                // Network error — never logout
                console.log("[KeyGuard] Network error, staying logged in.", err);
            }
        };

        checkKey(true);

        // Check every minute so expiry/revocation forces logout quickly.
        const interval = setInterval(() => checkKey(false), 60 * 1000);

        // Re-check when tab becomes visible again (if it's been a while)
        const onVisible = () => {
            if (document.visibilityState === "visible") checkKey(true);
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            mounted = false;
            clearInterval(interval);
            if (expiryTimerRef.current) window.clearTimeout(expiryTimerRef.current);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []); // No dependencies — stable interval

    return <>{children}</>;
}