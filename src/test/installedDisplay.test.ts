import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('installed phone system status bar', () => {
  it.each(['manifest.json', 'manifest.webmanifest'])('%s requests standalone, never fullscreen', (file) => {
    const manifest = JSON.parse(readFileSync(`public/${file}`, 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toEqual(['standalone']);
  });
});