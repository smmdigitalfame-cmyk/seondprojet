/** Only an explicit, authoritative license rejection can end a stored session. */
export function shouldEndKeySession(status: number, data: { valid?: boolean; code?: string }): boolean {
  return [400, 401, 403, 404].includes(status) && data.valid === false &&
    ['invalid_key', 'deactivated', 'expired'].includes(String(data.code || ''));
}
type KeySessionIdentity = { key: string; deviceFingerprint: string; loginAt?: string };
export function sameKeySession(current: KeySessionIdentity | null, checked: KeySessionIdentity): boolean {
  return !!current && current.key === checked.key && current.deviceFingerprint === checked.deviceFingerprint && current.loginAt === checked.loginAt;
}