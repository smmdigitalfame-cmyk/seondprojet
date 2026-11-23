/** Only an explicit, authoritative license rejection can end a stored session. */
export function shouldEndKeySession(status: number, data: { valid?: boolean; code?: string }): boolean {
  return [400, 401, 403, 404].includes(status) && data.valid === false &&
    ['invalid_key', 'deactivated', 'expired'].includes(String(data.code || ''));
}