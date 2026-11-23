export const PRIMARY_KEY_SERVER = 'https://xkgjifugwislpbczoduy.supabase.co/functions/v1/';
type KeyEndpoint = 'check-key-status' | 'logout-device' | 'claim-key-by-phone' | 'tg-get-key';
export function isPrimaryKeyServer(url: string) {
  try { return new URL(url).origin === new URL(PRIMARY_KEY_SERVER).origin; } catch { return false; }
}
export async function proxyPrimaryKeyRequest(name: KeyEndpoint, raw: string, primary: boolean, request = fetch): Promise<Response | null> {
  if (primary) return null;
  try {
    return await request(PRIMARY_KEY_SERVER + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return new Response(JSON.stringify({ valid: false, found: false, ok: false, code: 'verification_unavailable', error: 'Verification temporarily unavailable. Please try again.' }), { status: 503 });
  }
}
export type DeviceLicense = { ok: true; label: string; expiresAt: number } | { ok: false; status: number; code: string; error: string };
export async function checkPrimaryDevice(key: string, fp: string, request = fetch): Promise<DeviceLicense> {
  if (!key || !fp) return { ok: false, status: 401, code: 'missing_credentials', error: 'Login required.' };
  try {
    const response = await request(PRIMARY_KEY_SERVER + 'check-key-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceFingerprint: fp }), signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.valid === true) {
      return { ok: true, label: data.label || 'User', expiresAt: data.expires_at ? Date.parse(data.expires_at) : Infinity };
    }
    if (response.status >= 500 || response.status === 429 || !data.code || response.ok) {
      return { ok: false, status: 503, code: 'verification_unavailable', error: 'Verification temporarily unavailable. Please try again.' };
    }
    return { ok: false, status: response.status, code: String(data.code), error: String(data.error || 'Access verification failed.') };
  } catch { return { ok: false, status: 503, code: 'verification_unavailable', error: 'Verification temporarily unavailable. Please try again.' }; }
}