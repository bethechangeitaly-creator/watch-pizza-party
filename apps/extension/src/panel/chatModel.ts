import { isAllowedGifUrl, type ChatMessage } from '@watch-party/shared';
import type { TimelineEntry } from '../lib/messages';
import { entryKey } from '../lib/timeline';

export type ChatRow =
    | { kind: 'group'; key: string; userId: string; username: string; avatarColor: string; mine: boolean; messages: ChatMessage[] }
    | { kind: 'system'; key: string; text: string; timestamp: number }
    | { kind: 'donate'; key: string };

const GROUP_WINDOW_MS = 3 * 60_000;

/** Consecutive messages from the same person (by userId) within 3 minutes share one header. */
export function groupEntries(entries: TimelineEntry[], meUserId: string | null, opts: { donate?: boolean } = {}): ChatRow[] {
    const rows: ChatRow[] = [];
    for (const entry of entries) {
        if (entry.kind === 'system') {
            rows.push({ kind: 'system', key: entryKey(entry), text: entry.event.text, timestamp: entry.event.timestamp });
            continue;
        }
        const m = entry.message;
        const last = rows[rows.length - 1];
        const lastMessage = last?.kind === 'group' ? last.messages[last.messages.length - 1] : null;
        if (last?.kind === 'group' && last.userId === m.userId && lastMessage && m.timestamp - lastMessage.timestamp <= GROUP_WINDOW_MS) {
            last.messages.push(m);
        } else {
            rows.push({
                kind: 'group',
                key: entryKey(entry),
                userId: m.userId,
                username: m.username,
                avatarColor: m.avatarColor,
                mine: m.userId === meUserId,
                messages: [m],
            });
        }
    }
    if (opts.donate) rows.push({ kind: 'donate', key: 'donate' });
    return rows;
}

/** A message renders as an image only if it is exactly one Giphy CDN URL. */
export function gifFromText(text: string): string | null {
    const trimmed = text.trim();
    return /\s/.test(trimmed) || !isAllowedGifUrl(trimmed) ? null : trimmed;
}
