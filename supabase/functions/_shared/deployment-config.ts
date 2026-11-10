export function paymentCallbackUrl(backendUrl: string, configured?: string): string {
  const url = new URL(configured || `${backendUrl.replace(/\/$/, '')}/functions/v1/oxapay-callback`);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Secure payment callback URL required');
  return url.toString();
}