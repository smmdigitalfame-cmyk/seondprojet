/**
 * Authentication & License Key System
 * Uses Lovable Cloud Edge Functions for validation.
 */

const AUTH_STORAGE_KEY = "darksidex_auth_session";
const DEVICE_ID_KEY = "darksidex_device_id";
const MANUAL_LOGOUT_KEY = "darksidex_manual_logout";
const LOGGED_OUT_KEYS_KEY = "darksidex_logged_out_keys";
const AUTH_EVENT = "darksidex-auth-change";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getEdgeFunctionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

// ==================== DEVICE FINGERPRINT ====================

function readDeviceCookie(): string | null {
    try {
        const match = document.cookie.match(/(?:^|;\s*)darksidex_device_id=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    } catch {
        return null;
    }
}

function persistDeviceId(id: string) {
    try {
        localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {}
    try {
        // Cookie survives some storage clears / PWA reinstalls, keeping the
        // same licensed device recognisable for the full key duration.
        document.cookie = `${DEVICE_ID_KEY}=${encodeURIComponent(id)};path=/;max-age=${60 * 60 * 24 * 3650};SameSite=Lax`;
    } catch {}
}

export function getDeviceFingerprint(): string {
    const existingId = localStorage.getItem(DEVICE_ID_KEY);
    if (existingId) {
        persistDeviceId(existingId);
        return existingId;
    }
    const cookieId = readDeviceCookie();
    if (cookieId) {
        persistDeviceId(cookieId);
        return cookieId;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("fingerprint", 2, 2);
    }
    const canvasHash = canvas.toDataURL().slice(-50);

    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + "x" + screen.height,
        screen.colorDepth.toString(),
        new Date().getTimezoneOffset().toString(),
        navigator.hardwareConcurrency?.toString() || "0",
        (navigator as any).deviceMemory?.toString() || "0",
        navigator.platform || "",
        canvasHash,
    ];

    let hash = 0;
    const str = components.join("|");
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    const newId = "DX-" + Math.abs(hash).toString(36).toUpperCase().padStart(8, "0");
    persistDeviceId(newId);
    return newId;
}

// ==================== SESSION MANAGEMENT ====================

export interface AuthSession {
    key: string;
    deviceFingerprint: string;
    loginAt: string;
}

function notifyAuthChange(authenticated: boolean) {
    try {
        window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { authenticated } }));
    } catch {}
}

export function subscribeAuthChanges(callback: (authenticated: boolean) => void) {
    const handler = (event: Event) => {
        callback(Boolean((event as CustomEvent).detail?.authenticated));
    };
    window.addEventListener(AUTH_EVENT, handler);
    return () => window.removeEventListener(AUTH_EVENT, handler);
}

export function getAuthSession(): AuthSession | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function getLoggedOutKeys(): string[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOGGED_OUT_KEYS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    } catch {
        return [];
    }
}

function rememberLoggedOutKey(key?: string) {
    const normalizedKey = String(key || "").trim().toUpperCase();
    if (!normalizedKey) return;
    const keys = getLoggedOutKeys().filter((k) => k !== normalizedKey);
    keys.unshift(normalizedKey);
    localStorage.setItem(LOGGED_OUT_KEYS_KEY, JSON.stringify(keys.slice(0, 20)));
}

export function isKeyBlockedAfterLogout(key: string): boolean {
    // Logging out ends only the current session. A still-valid key may be used
    // again on the same licensed device.
    return false;
}

export function saveAuthSession(session: AuthSession): boolean {
    const normalizedSession = { ...session, key: session.key.trim().toUpperCase() };
    localStorage.removeItem(MANUAL_LOGOUT_KEY);
    localStorage.removeItem(LOGGED_OUT_KEYS_KEY);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));
    notifyAuthChange(true);
    return true;
}

export function clearAuthSession(options?: { manual?: boolean }) {
    const existingSession = getAuthSession();
    if (options?.manual) {
        localStorage.setItem(MANUAL_LOGOUT_KEY, String(Date.now()));
        rememberLoggedOutKey(existingSession?.key);
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    notifyAuthChange(false);
}

export function wasManualLoggedOut(): boolean {
    return Boolean(localStorage.getItem(MANUAL_LOGOUT_KEY));
}

export async function logoutCurrentDevice(): Promise<void> {
    const session = getAuthSession();
    const deviceFP = session?.deviceFingerprint || getDeviceFingerprint();
    const key = session?.key;
    if (!key) {
      clearAuthSession({ manual: true });
      return;
    }
    // Send Telegram alert BEFORE clearing session (sendTelegramAlert needs the session)
    try {
        await sendTelegramAlert({ action: "Logout" });
    } catch {}
    try {
        await fetch(getEdgeFunctionUrl("logout-device"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                            },
            body: JSON.stringify({ device_fp: deviceFP, key }),
            signal: AbortSignal.timeout(8000),
        });
    } catch {
        // Logout must always clear the local session even if the network fails.
    } finally {
        clearAuthSession({ manual: true });
    }
}

export async function validateStoredSession(): Promise<boolean> {
    const session = getAuthSession();
    if (!session?.key || !session.deviceFingerprint) {
        clearAuthSession();
        return false;
    }

    try {
        const result = await fetch(getEdgeFunctionUrl("check-key-status"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                            },
            body: JSON.stringify({
                key: session.key,
                deviceFingerprint: session.deviceFingerprint,
            }),
            signal: AbortSignal.timeout(10000),
        });
        const data = await result.json().catch(() => ({}));
        if (result.ok && data?.valid === true) return true;
        const rejectionCode = String(data?.code || "");
        if (["invalid_key", "deactivated", "expired"].includes(rejectionCode)) {
            clearAuthSession();
            return false;
        }
        // Device verification and temporary service failures must not end a
        // locally valid paid session before the key's actual expiry.
        return true;
    } catch {
        // Offline/timeout is not proof that the paid key expired.
        return true;
    }
}

/**
 * Background revalidation used at app startup.
 * Network/timeout failures keep the user logged in (returns true);
 * only an explicit server "invalid" response signs them out.
 */
export async function revalidateStoredSession(): Promise<boolean> {
    const session = getAuthSession();
    if (!session?.key || !session.deviceFingerprint) return false;
    try {
        const result = await fetch(getEdgeFunctionUrl("check-key-status"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                key: session.key,
                deviceFingerprint: session.deviceFingerprint,
            }),
            signal: AbortSignal.timeout(10000),
        });
        const data = await result.json().catch(() => ({}));
        if (result.ok && data?.valid === true) return true;
        const rejectionCode = String(data?.code || "");
        if (["invalid_key", "deactivated", "expired"].includes(rejectionCode)) {
            clearAuthSession();
            return false;
        }
        // Never infer expiry from an HTTP status alone. A 403 can mean a
        // changed browser fingerprint/device-limit check, not an expired key.
        return true;
    } catch {
        // Offline / timeout — stay logged in.
        return true;
    }
}


// ==================== TELEGRAM ALERT ====================

export async function sendTelegramAlert(opts: { action: string; username?: string }) {
    try {
        const session = getAuthSession();
        const key = session?.key;
        if (!key) return; // alerts are only for authenticated sessions
        const deviceFP = session?.deviceFingerprint || getDeviceFingerprint();

        let ipInfo: any = { ip: "Unknown", city: "Unknown", country_name: "Unknown" };
        try {
            const geoRes = await fetch("https://ipapi.co/json/");
            if (geoRes.ok) ipInfo = await geoRes.json();
        } catch {}

        const ACTION_MAP: Record<string, string> = {
            "Login Success": "LOGIN",
            "Logout": "LOGOUT",
            "Search": "SEARCH",
            "Profile View": "PROFILE_VIEW",
        };
        const action = ACTION_MAP[opts.action] || "SEARCH";
        const location = `${ipInfo.city || ""}, ${ipInfo.country_name || ""}`.replace(/^, |, $/g, "");

        await fetch(getEdgeFunctionUrl("telegram"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                            },
            body: JSON.stringify({
                action,
                username: opts.username || "",
                key,
                device_fp: deviceFP,
                ip: ipInfo.ip,
                location,
            }),
        });
    } catch (e) {
        console.error("Failed to send telegram alert:", e);
    }
}

// ==================== LOGIN VALIDATION ====================

export type LoginResult =
    | { success: true }
    | { success: false; error: string };

export async function validateAndLogin(accessKey: string): Promise<LoginResult> {
    const normalizedKey = accessKey.trim().toUpperCase();

    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalizedKey)) {
        return { success: false, error: "Please enter your access key." };
    }

    try {
        const deviceFP = getDeviceFingerprint();

        const result = await fetch(getEdgeFunctionUrl("check-key-status"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                key: normalizedKey,
                deviceFingerprint: deviceFP,
            }),
        });

        const data = await result.json();

        if (result.ok && data.valid) {
            saveAuthSession({
                key: normalizedKey,
                deviceFingerprint: deviceFP,
                loginAt: new Date().toISOString(),
            });

            // Fire-and-forget Telegram alert for login event
            void sendTelegramAlert({ action: "Login Success" });

            return { success: true };
        }

        return { success: false, error: data.error || "Login failed. Please try again." };
    } catch (err: any) {
        console.error("[Auth] Login error:", err);
        return { success: false, error: "Server error. Please try again." };
    }
}

export function isAuthenticated(): boolean {
    const session = getAuthSession();
    return !!session;
}

export async function isAuthenticatedAsync(): Promise<boolean> {
    return validateStoredSession();
}

export async function getYoutubeUrl(): Promise<string> {
    return "https://www.youtube.com/embed/pYfpNRmoRC0?rel=0&modestbranding=1&showinfo=0";
}
