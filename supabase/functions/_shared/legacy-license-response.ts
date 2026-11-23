export type LegacyResult = { status: 'valid' | 'device_limit' | 'expired' | 'deactivated' | 'invalid' | 'unknown'; label?: string; expiresAt: string | null; maxDevices?: number };
export function legacyLicenseResponse(status: number, data: Record<string, unknown>): LegacyResult {
  const unknown: LegacyResult = { status: 'unknown', expiresAt: null };
  if (status >= 500 || status === 429) return unknown;
  const code = String(data.code || '').toLowerCase();
  const msg = String(data.error || '').toLowerCase();
  // An expired gateway JWT is not an expired paid license.
  if (!['expired', 'deactivated', 'invalid_key', 'device_limit', 'device_limit_reached'].includes(code) && /\b(jwt|token|authorization|credential|api)\b/.test(msg)) return unknown;
  const hasExpiry = Object.prototype.hasOwnProperty.call(data, 'expires_at') || Object.prototype.hasOwnProperty.call(data, 'expiresAt');
  const rawExpiry = data.expires_at ?? data.expiresAt ?? null;
  if (rawExpiry !== null && (typeof rawExpiry !== 'string' || !Number.isFinite(Date.parse(rawExpiry)))) return unknown;
  const maxRaw = Number(data.max_devices ?? data.maxDevices ?? 0);
  const base = { expiresAt: rawExpiry as string | null, label: typeof data.label === 'string' ? data.label : undefined, maxDevices: Number.isSafeInteger(maxRaw) && maxRaw > 0 ? maxRaw : undefined };
  if (status >= 200 && status < 300 && data.valid === true) return hasExpiry ? { status: 'valid', ...base } : unknown;
  if (data.valid !== false && !code) return unknown;
  if (['device_limit', 'device_limit_reached'].includes(code) || /device/.test(msg)) return { status: 'device_limit', ...base };
  if (code === 'expired' || /expired/.test(msg)) return { status: 'expired', ...base };
  if (code === 'deactivated' || /deactivat|revok/.test(msg)) return { status: 'deactivated', ...base };
  if (code === 'invalid_key' || status === 404 && /invalid/.test(msg)) return { status: 'invalid', ...base };
  return unknown;
}