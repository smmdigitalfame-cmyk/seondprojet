export type BroadcastMessage = { message_id?: number; text?: string; photo?: unknown[]; video?: unknown; document?: unknown; animation?: unknown; voice?: unknown; audio?: unknown; sticker?: unknown };

export function broadcastRequest(chat: string, adminIds: string[], message: BroadcastMessage) {
  if (!adminIds.map(id => id.trim()).filter(Boolean).includes(chat)) return null;
  const text = message.text?.trim();
  const command = text?.match(/^\/(?:broadcast|bc)(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (command) return { text: command[1]?.trim() ?? '', copy: false };
  // Commands and receipt IDs must never become announcements.
  if (text?.startsWith('/') || (text && /^\d+$/.test(text))) return null;
  const media = message.photo || message.video || message.document || message.animation || message.voice || message.audio || message.sticker;
  if (text || media) return { text: text ?? '', copy: true };
  return null;
}

export async function sendBroadcast(ids: string[], send: (id: string) => Promise<unknown>, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  let sent = 0, failed = 0;
  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += 20) {
    for (const result of await Promise.allSettled(unique.slice(i, i + 20).map(send))) {
      if (result.status === 'fulfilled') sent++; else failed++;
    }
    if (i + 20 < unique.length) await pause(1100);
  }
  return { sent, failed };
}