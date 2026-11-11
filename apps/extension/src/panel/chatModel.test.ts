import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../lib/messages';
import { gifFromText, groupEntries } from './chatModel';

const msg = (userId: string, username: string, timestamp: number, text = 'hi'): TimelineEntry => ({
    kind: 'chat', message: { id: `${userId}-${timestamp}`, userId, username, avatarColor: '#3DD68C', text, timestamp },
});
const sys = (timestamp: number): TimelineEntry => ({ kind: 'system', event: { kind: 'join', text: 'Bea joined', timestamp } });

describe('groupEntries', () => {
    it('groups by userId, not name (same-name regression)', () => {
        const rows = groupEntries([msg('u1', 'Marco', 0), msg('u2', 'Marco', 1000), msg('u2', 'Marco', 2000)], 'u2');
        expect(rows.map((r) => r.kind === 'group' && [r.userId, r.mine, r.messages.length])).toEqual([['u1', false, 1], ['u2', true, 2]]);
    });

    it('splits groups after 3 minutes and around system events', () => {
        const rows = groupEntries([msg('u1', 'A', 0), msg('u1', 'A', 179_000), msg('u1', 'A', 360_000), sys(361_000), msg('u1', 'A', 362_000)], null);
        expect(rows.map((r) => (r.kind === 'group' ? r.messages.length : r.kind))).toEqual([2, 1, 'system', 1]);
    });

    it('appends the donate row when asked', () => {
        expect(groupEntries([msg('u1', 'A', 0)], null, { donate: true }).at(-1)?.kind).toBe('donate');
    });
});

describe('gifFromText', () => {
    it('only giphy urls become gifs', () => {
        expect(gifFromText('https://media2.giphy.com/media/a/200.gif')).toBe('https://media2.giphy.com/media/a/200.gif');
        expect(gifFromText(' https://i.giphy.com/a.gif ')).toBe('https://i.giphy.com/a.gif');
        expect(gifFromText('https://evil.com/track.gif')).toBeNull();
        expect(gifFromText('look https://media2.giphy.com/media/a/200.gif')).toBeNull();
    });
});
