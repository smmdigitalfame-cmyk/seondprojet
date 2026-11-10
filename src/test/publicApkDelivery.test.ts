import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_APK_FILE_ID, sendPurchasedApk } from '../../supabase/functions/_shared/public-apk-delivery';

describe('Purchased APK delivery', () => {
  it('sends the supplied APK and access key together, without a website link', async () => {
    const call = vi.fn().mockResolvedValue({ message_id: 1 });
    await sendPurchasedApk(call, '123', { key: 'TEST-KEY', expires_at: null });
    expect(call).toHaveBeenCalledExactlyOnceWith('sendDocument', {
      chat_id: '123', document: PUBLIC_APK_FILE_ID,
      caption: expect.stringContaining('<code>TEST-KEY</code>'), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '📋 Copy access key', copy_text: { text: 'TEST-KEY' } }], [{ text: '▶️ YouTube · How to use', url: 'https://youtu.be/6fyQY7e4h9o' }]] },
    });
    expect(call.mock.calls[0][1].caption).not.toMatch(/https?:\/\//);
  });
  it('copies the exact key without surrounding formatting or other text', async () => {
    const call = vi.fn().mockResolvedValue({ message_id: 1 });
    await sendPurchasedApk(call, '123', { key: 'TT-0123456789ABCDEF0123', expires_at: null }, 'tiktok');
    expect(call.mock.calls[0][1].reply_markup.inline_keyboard[0][0].copy_text.text).toBe('TT-0123456789ABCDEF0123');
    expect(call.mock.calls[0][1].protect_content).not.toBe(true);
  });
  it('does not report success if Telegram rejects the document', async () => {
    const call = vi.fn().mockRejectedValue(new Error('Delivery failed'));
    await expect(sendPurchasedApk(call, '123', { key: 'TEST-KEY', expires_at: null })).rejects.toThrow('Delivery failed');
  });
  it.each([
    ['instagram', 'https://youtu.be/6fyQY7e4h9o'],
    ['tiktok', 'https://youtube.com/shorts/KITGjjZQMuQ'],
  ] as const)('delivers only the matching %s how-to video with the APK and original key', async (product, url) => {
    const call = vi.fn().mockResolvedValue({ message_id: 1 });
    await sendPurchasedApk(call, '123', { key: 'TEST-KEY', expires_at: null }, product);
    expect(call).toHaveBeenCalledTimes(1);
    const buttons = call.mock.calls[0][1].reply_markup.inline_keyboard.flat();
    expect(buttons.filter((button: { url?: string }) => button.url).map((button: { url: string }) => button.url)).toEqual([url]);
  });
});