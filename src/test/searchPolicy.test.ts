import { describe, expect, it } from 'vitest';
import { SEARCH_REEL_PAGES, SEARCH_POST_PAGES, SEARCH_MAX_ITEMS, discoverAllowed } from '../../supabase/functions/instagram-scraper/searchPolicy';
describe('Paid search and public discovery boundaries', () => {
  it('limits a search to six profile/media calls', () => {
    expect(1 + SEARCH_REEL_PAGES + SEARCH_POST_PAGES).toBe(6);
  });
  it('limits cloned items to sixty', () => expect(SEARCH_MAX_ITEMS).toBe(60));
  it('mixes any public account searched by users into Home', () => {
    expect(discoverAllowed({ username: 'buyer_public_search' })).toBe(true);
    expect(discoverAllowed({ username: 'cristiano' })).toBe(true);
  });
  it('excludes private accounts for either provider field', () => {
    expect(discoverAllowed({ username: 'cristiano', is_private: true })).toBe(false);
    expect(discoverAllowed({ username: 'cristiano', isPrivate: true })).toBe(false);
  });
});