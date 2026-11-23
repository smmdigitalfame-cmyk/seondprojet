export type ScrapeOptions = { force?: boolean; pages?: number; cursor?: string; background?: boolean };
/** Automatic maintenance can only read cache; only a user action can spend provider calls. */
export function scrapeRequestPolicy(options: ScrapeOptions): ScrapeOptions {
  return options.background ? { background: true, pages: 1 } : options;
}