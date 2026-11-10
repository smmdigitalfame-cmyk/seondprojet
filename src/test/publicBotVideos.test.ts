import { describe, it, expect } from 'vitest';
import { BOT_HOME, BOT_HELP, productPlans } from '../../supabase/functions/_shared/public-bot-menu';

describe('Product demo and how-to access', () => {
  it.each([
    ['instagram', 'https://youtu.be/6fyQY7e4h9o'],
    ['tiktok', 'https://youtube.com/shorts/KITGjjZQMuQ'],
  ] as const)('opens the matching %s demo before purchase', (product, url) => {
    const buttons = productPlans(product).reply_markup.inline_keyboard.flat();
    expect(buttons.filter(button => 'url' in button).map(button => 'url' in button ? button.url : null)).toEqual([url]);
    expect(buttons.filter(button => 'callback_data' in button && button.callback_data.startsWith('buy:')).every(button => 'callback_data' in button && button.callback_data.startsWith(`buy:${product}:`))).toBe(true);
  });
  it.each([BOT_HOME, BOT_HELP])('allows both videos without creating a purchase', menu => {
    const urls = menu.reply_markup.inline_keyboard.flat().filter(button => 'url' in button).map(button => 'url' in button ? button.url : null);
    expect(urls).toContain('https://youtu.be/6fyQY7e4h9o');
    expect(urls).toContain('https://youtube.com/shorts/KITGjjZQMuQ');
  });
});