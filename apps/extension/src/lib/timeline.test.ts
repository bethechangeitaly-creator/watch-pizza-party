import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from './messages';
import { entryKey, mergeEntries } from './timeline';

const chat = (id: string, timestamp: number): TimelineEntry => ({
    kind: 'chat', message: { id, userId: 'u', username: 'U', avatarColor: '#fff', text: 'hi', timestamp },
});
const sys = (kind: 'join' | 'leave', timestamp: number): TimelineEntry => ({ kind: 'system', event: { kind, text: 'x', timestamp } });

describe('mergeEntries', () => {
    it('dedupes and sorts', () => {
        const a = chat('1', 10);
        const b = chat('2', 5);
        const c = sys('join', 7);
        expect(mergeEntries([a], [b, a, c]).map(entryKey)).toEqual(['chat:2', 'sys:join:7:', 'chat:1']);
    });

    it('keeps the newest 200', () => {
        const many = Array.from({ length: 250 }, (_, i) => chat(String(i), i));
        const merged = mergeEntries([], many);
        expect(merged).toHaveLength(200);
        expect(merged[0].kind === 'chat' && merged[0].message.timestamp).toBe(50);
    });

    it('history replace keeps local system entries', () => {
        const merged = mergeEntries([sys('join', 3)], [chat('1', 1), chat('2', 5)]);
        expect(merged.map(entryKey)).toEqual(['chat:1', 'sys:join:3:', 'chat:2']);
    });
});
