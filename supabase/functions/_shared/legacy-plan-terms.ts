const LEGACY_DAYS: Record<number, number | null> = {
  50: 1, 100: 1, 149: 1, 199: 1,
  500: 7, 599: 7, 999: 7,
  1000: 30, 1199: 30, 2999: 30,
  3499: null, 5999: null,
};
/** Keep existing checkout prices; the selected lifetime plan never acquires an expiry. */
export function legacyPlanFromAmount(amountPaise: number): { days: number | null; label: string } | null {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise % 100 !== 0) return null;
  const rupees = amountPaise / 100;
  if (!Object.prototype.hasOwnProperty.call(LEGACY_DAYS, rupees)) return null;
  const days = LEGACY_DAYS[rupees];
  return { days, label: days === null ? 'Lifetime' : days === 1 ? (rupees === 50 ? '1 Day (Test)' : '1 Day') : days === 7 ? 'Weekly' : 'Monthly' };
}
export function legacySourcePlanMatchesAmount(planId: string, amountPaise: number): boolean {
  const plan = legacyPlanFromAmount(amountPaise);
  const days: Record<string, number | null> = { '1': 1, '7': 7, '30': 30, lifetime: null };
  return !!plan && Object.prototype.hasOwnProperty.call(days, planId) && days[planId] === plan.days;
}
export function purchasedExpiry(days: number | null, now: number): string | null {
  return days === null ? null : new Date(now + days * 86400000).toISOString();
}
export function requestedDeviceLimit(input = '1'): number | null {
  if (!/^\d+$/.test(input)) return null;
  const count = Number(input);
  return Number.isSafeInteger(count) && count >= 1 ? count : null;
}