import { describe, it, expect, vi } from 'vitest';
import { runBotReporting } from '../../supabase/functions/_shared/public-bot-background';
import { botCommand, BOT_BOTTOM_MENU } from '../../supabase/functions/_shared/public-bot-menu';

describe('Fast bot reporting and bottom actions', () => {
  it('returns without waiting for reporting when the runtime retains the task', async () => {
    let resolve: (() => void) | undefined;
    const task = new Promise<void>(done => { resolve = done; });
    const runtime = { waitUntil: vi.fn() };
    await runBotReporting(task, runtime);
    expect(runtime.waitUntil).toHaveBeenCalledTimes(1);
    resolve?.();
    await runtime.waitUntil.mock.calls[0][0];
  });
  it('awaits reporting if background retention is unavailable', async () => {
    let resolve: (() => void) | undefined;
    const task = new Promise<void>(done => { resolve = done; });
    let completed = false;
    const result = runBotReporting(task).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolve?.();
    await result;
    expect(completed).toBe(true);
  });
  it.each([
    ['🛍 Buy access', '/buy'], ['▶️ Demo & how to use', '/demo'],
    ['📦 My APK & keys', '/mykey'], ['❓ Help', '/help'], ['🏠 Menu', '/menu'],
  ])('routes %s to the existing %s flow', (label, command) => {
    expect(botCommand(label)).toBe(command);
    expect(BOT_BOTTOM_MENU.keyboard.flat().some(button => botCommand(button.text) === command)).toBe(true);
  });
});