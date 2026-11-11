import { describe, expect, it } from 'vitest';
import { sessionWith } from '../test/sessions';
import { statusLine } from './statusLine';

const otherSite = { tabId: 1, url: 'https://example.com/' };
const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

describe('statusLine', () => {
    it.each([
        ['reconnecting', { status: 'reconnecting' as const }, { tone: 'warn', text: 'Reconnecting…' }],
        ['no tab', { mediaTab: null }, { tone: 'warn', text: 'Pick a tab to watch in', action: { label: 'Use this tab', request: { type: 'session.useTab', tabId: 1 } } }],
        ['host, nothing playing yet', { isHost: true }, { tone: 'muted', text: 'Open a YouTube or Netflix video to start watching' }],
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
});
