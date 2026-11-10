export function secureTelegramSecret(actual: string | null, expected: string): boolean {
  if (!expected || !actual || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export async function adminWebhookSecret(token: string, configured?: string): Promise<string> {
  if (configured) return configured;
  if (!token) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`admin-telegram-webhook:${token}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}