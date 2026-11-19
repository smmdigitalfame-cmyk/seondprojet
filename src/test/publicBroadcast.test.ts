import { describe, expect, it } from 'vitest';
import { broadcastRequest, sendBroadcast } from '../../supabase/functions/_shared/public-broadcast';

describe('Insights Editor admin announcements', () => {
  it('broadcasts a normal message from the configured admin', () => {
    expect(broadcastRequest('123', ['123'], { text: 'New update' })).toEqual({ text: 'New update', copy: true });
  });
  it('does not grant notification recipients or buyers admin privileges', () => {
    expect(broadcastRequest('8766641148', ['123'], { text: 'New update' })).toBeNull();
  });
  it('never broadcasts payment transaction IDs', () => {
    expect(broadcastRequest('123', ['123'], { text: '464993644525346816' })).toBeNull();
  });
  it('never broadcasts unrelated admin commands', () => {
    expect(broadcastRequest('123', ['123'], { text: '/gen buyer 1' })).toBeNull();
  });
  it('accepts photos from admins', () => {
    expect(broadcastRequest('123', ['123'], { message_id: 10, photo: [{}] })?.copy).toBe(true);
  });
  it('supports explicit announcements', () => {
    expect(broadcastRequest('123', ['123'], { text: '/broadcast New update' })).toEqual({ text: 'New update', copy: false });
  });
  it('counts delivery failures honestly and sends once per recipient', async () => {
    const delivered: string[] = [];
    const result = await sendBroadcast(['1', '1', '2'], async id => { if (id === '2') throw new Error('blocked'); delivered.push(id); });
    expect(delivered).toEqual(['1']);
    expect(result).toEqual({ sent: 1, failed: 1 });
  });
});