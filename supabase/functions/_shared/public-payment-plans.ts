export const PUBLIC_PLANS = {
  day: { title: '1 day', amount: 1, days: 1 },
  week: { title: '7 days', amount: 5, days: 7 },
  month: { title: 'Monthly · 30 days', amount: 10, days: 30 },
  lifetime: { title: 'Lifetime', amount: 25, days: null },
} as const;

export function paymentMatches(order: { track_id: string; amount: number | string; currency: string }, payment: { track_id?: unknown; amount?: unknown; currency?: unknown; status?: unknown }): boolean {
  return typeof order.track_id === 'string' && order.track_id.length > 0
    && (typeof payment.amount === 'number' || (typeof payment.amount === 'string' && /^\d+(\.\d+)?$/.test(payment.amount)))
    && Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0
    && String(payment.track_id) === order.track_id && Number(payment.amount) === Number(order.amount)
    && payment.currency === order.currency && String(payment.status).toLowerCase() === 'paid';
}

export function verifiedPaymentMatches(order: { id: string; track_id: string; plan_id: string; product: string; duration_days: number | null; amount: number | string; currency: string }, payment: { order_id?: unknown; track_id?: unknown; amount?: unknown; currency?: unknown; status?: unknown }): boolean {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_PLANS, order.plan_id)) return false;
  const plan = PUBLIC_PLANS[order.plan_id as keyof typeof PUBLIC_PLANS];
  return ['instagram', 'tiktok'].includes(order.product) && order.currency === 'USD'
    && Number(order.amount) === plan.amount && order.duration_days === plan.days
    && payment.order_id === order.id && paymentMatches(order, payment);
}