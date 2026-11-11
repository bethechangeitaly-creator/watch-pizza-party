import type { TimelineEntry } from './messages';

export const ENTRIES_KEY = 'wpp.entries';
export const ENTRIES_CAP = 200;

export function entryKey(e: TimelineEntry): string {
    return e.kind === 'chat' ? `chat:${e.message.id}` : `sys:${e.event.kind}:${e.event.timestamp}:${e.event.userId ?? ''}`;
}

export function entryTime(e: TimelineEntry): number {
    return e.kind === 'chat' ? e.message.timestamp : e.event.timestamp;
}

/** Union of both lists, deduplicated, oldest first, keeping only the newest `cap`. */
export function mergeEntries(existing: TimelineEntry[], incoming: TimelineEntry[], cap = ENTRIES_CAP): TimelineEntry[] {
    const byKey = new Map<string, TimelineEntry>();
    for (const entry of [...existing, ...incoming]) byKey.set(entryKey(entry), entry);
    const sorted = [...byKey.values()].sort((a, b) => entryTime(a) - entryTime(b));
    return sorted.slice(Math.max(0, sorted.length - cap));
}
