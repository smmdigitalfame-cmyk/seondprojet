// Fixed, server-owned budgets apply equally to direct and connector credentials.
export const SEARCH_REEL_PAGES = 3;
export const SEARCH_POST_PAGES = 2;
export const SEARCH_MAX_ITEMS = 60;
// Home can read only this existing public showcase, not users' search history.
export const PUBLIC_DISCOVER_USERNAMES = [
  'selenagomez', 'therock', 'kyliejenner', 'arianagrande', 'kimkardashian',
  'mrbeast', 'realdonaldtrump', 'cristiano', 'leomessi', 'theclips.agency',
  'getclipify', 'jannatzubair29', 'anushkasen0408', 'bhuvan.bam22',
  'avneetkaur_13', 'mostlysane', 'lelepons', 'ashishchanchlani',
  'barkhasingh03', 'ahsaaschanna_',
];
export function discoverAllowed(profile: { username?: string; isPrivate?: boolean; is_private?: boolean } | null): boolean {
  return !!profile?.username && !profile.isPrivate && !profile.is_private &&
    PUBLIC_DISCOVER_USERNAMES.includes(profile.username.toLowerCase());
}