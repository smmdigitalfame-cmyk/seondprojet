import { describe, expect, it } from 'vitest';
import { scrapeRequestPolicy } from '../lib/scrapeRequestPolicy';
import { cacheOnlyRequest } from '../../supabase/functions/instagram-scraper/searchPolicy';
describe('automatic refresh cannot spend paid calls or compete with clone', () => {
  it('turns old force/cursor/background requests into cache-only reads',()=>expect(scrapeRequestPolicy({background:true,pages:30,force:true,cursor:'paid-page'})).toEqual({background:true,pages:1}));
  it('keeps an explicit user clone request intact',()=>expect(scrapeRequestPolicy({pages:30,force:true})).toEqual({pages:30,force:true}));
  it('treats pages 1 as cache-only on the server',()=>expect(cacheOnlyRequest({pages:1})).toBe(true));
  it('keeps background requests cache-only even if the caller asks for thirty pages',()=>expect(cacheOnlyRequest({pages:30,background:true})).toBe(true));
});