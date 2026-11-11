import { describe, expect, it } from 'vitest';
import { sessionWith } from '../test/sessions';
import { statusLine } from './statusLine';

const otherSite = { tabId: 1, url: 'https://example.com/' };
const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

describe('statusLine', () => {
    it.each([
        ['reconnecting', { status: 'reconnecting' as const }, { tone: 'warn', text: 'Reconnecting…' }],
        ['no tab', { mediaTab: null }, { tone: 'warn', text: 'Pick a tab to watch in', action: { label: 'Use this tab', request: { type: 'session.useTab', tabId: 1 } } }],
        ['host, nothing playing yet', { isHost: true }, { tone: 'muted', text: 'Open a video on YouTube, Netflix or Prime Video to start watching' }],
        ['host', { isHost: true, playing: true }, { tone: 'ok', text: "You're the host" }],
        ['host + drifting viewer', { isHost: true, playing: true, driftingViewer: true }, { action: { label: 'Sync everyone', request: { type: 'sync.force' } } }],
        ['viewer synced', { mySync: 'synced' as const }, { tone: 'ok', text: 'In sync' }],
        ['viewer drifting', { mySync: 'drifting' as const }, { tone: 'warn', text: 'Catching up…', action: { label: 'Resync', request: { type: 'sync.resyncMe' } } }],
        ['host in ad', { timelineInAd: true }, { tone: 'muted', text: "Waiting for the host's ad" }],
        ['own ad', { mySync: 'ad' as const }, { tone: 'muted', text: "You're in an ad" }],
        ['buffering', { mySync: 'buffering' as const }, { tone: 'muted', text: 'Buffering…' }],
        ['paused', { mySync: 'paused' as const }, { tone: 'muted', text: 'Paused' }],
        ['no report yet', {}, { tone: 'muted', text: 'Waiting for the video…' }],
    ])('statusLine %s', (_name, overrides, expected) => expect(statusLine(sessionWith(overrides), otherSite)).toMatchObject(expected));

    it('host status has no action when everyone is in sync', () => {
        expect(statusLine(sessionWith({ isHost: true, playing: true }), otherSite).action).toBeUndefined();
    });

    it('offers "Use this tab" when a video is open in another tab', () => {
        const host = statusLine(sessionWith({ isHost: true }), { tabId: 2, url: VIDEO });
        expect(host.action).toEqual({ label: 'Use this tab', request: { type: 'session.useTab', tabId: 2 } });
        const viewer = statusLine(sessionWith({ mySync: 'synced' }), { tabId: 2, url: VIDEO });
        expect(viewer.action).toEqual({ label: 'Use this tab', request: { type: 'session.useTab', tabId: 2 } });
    });

    it('no "Use this tab" for the party tab itself or a non-video tab', () => {
        expect(statusLine(sessionWith({ isHost: true }), { tabId: 1, url: VIDEO }).action).toBeUndefined();
        expect(statusLine(sessionWith({ isHost: true }), otherSite).action).toBeUndefined();
    });

    it('a viewer without Prime Video access gets one button to allow it', () => {
        const session = sessionWith({ playing: true, mySync: 'synced' });
        session.room!.timeline = { ...session.room!.timeline!, platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' };
        expect(statusLine(session, otherSite, false)).toEqual({
            tone: 'warn',
            text: 'Allow Prime Video to follow the host',
            action: { label: 'Allow Prime Video', request: { type: 'sync.resyncMe' }, needsPrime: true },
        });
        expect(statusLine(session, otherSite, true).text).toBe('In sync');
    });

    it('"Use this tab" on a Prime Video tab asks for access first', () => {
        const prime = { tabId: 1, url: 'https://www.primevideo.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP' };
        expect(statusLine(sessionWith({ mediaTab: null }), prime, false).action).toEqual({ label: 'Use this tab', request: { type: 'session.useTab', tabId: 1 }, needsPrime: true });
        expect(statusLine(sessionWith({ mediaTab: null }), prime, true).action).toEqual({ label: 'Use this tab', request: { type: 'session.useTab', tabId: 1 } });
    });

    it('asks a viewer to click the video once when it is needed', () => {
        const session = { ...sessionWith({ playing: true, mySync: 'drifting' }), needsVideoClick: true };
        expect(statusLine(session, otherSite)).toEqual({ tone: 'warn', text: 'Click once on the video to start syncing' });
        expect(statusLine({ ...session, isHost: true }, otherSite).text).toBe('Move your mouse over the video once to start syncing');
    });

    it('the host on a Prime Video tab without access gets the Allow button too (party started elsewhere)', () => {
        const prime = { tabId: 1, url: 'https://www.primevideo.com/detail/0IXW1S25YINLVCJUNC1IJSVOOB?ref_=atv_hm_hom_c_DGe5ed62_6_2' };
        const session = sessionWith({ isHost: true, mediaTab: { tabId: 1, title: "Prime Video: C'mon C'mon" } });
        expect(statusLine(session, prime, false)).toEqual({
            tone: 'warn',
            text: 'Allow Prime Video to share what you watch',
            action: { label: 'Allow Prime Video', request: { type: 'session.useTab', tabId: 1 }, needsPrime: true },
        });
        expect(statusLine(session, prime, true).text).not.toMatch(/Allow/);
    });

    it('asks the host to move the mouse over the video once (a click would pause it)', () => {
        const session = { ...sessionWith({ isHost: true, playing: true }), needsVideoClick: true };
        expect(statusLine(session, otherSite)).toEqual({ tone: 'warn', text: 'Move your mouse over the video once to start syncing' });
    });
});
