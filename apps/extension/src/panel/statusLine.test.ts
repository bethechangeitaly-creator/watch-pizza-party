import { describe, expect, it } from 'vitest';
import { sessionWith } from '../test/sessions';
import { statusLine } from './statusLine';

describe('statusLine', () => {
    it.each([
        ['reconnecting', { status: 'reconnecting' as const }, { tone: 'warn', text: 'Reconnecting…' }],
        ['no tab', { mediaTab: null }, { tone: 'warn', text: 'Pick a tab to watch in', action: { label: 'Use this tab', request: { type: 'session.useTab', tabId: 1 } } }],
        ['host', { isHost: true }, { tone: 'ok', text: "You're the host" }],
        ['host + drifting viewer', { isHost: true, driftingViewer: true }, { action: { label: 'Sync everyone', request: { type: 'sync.force' } } }],
        ['viewer synced', { mySync: 'synced' as const }, { tone: 'ok', text: 'In sync' }],
        ['viewer drifting', { mySync: 'drifting' as const }, { tone: 'warn', text: 'Catching up…', action: { label: 'Resync', request: { type: 'sync.resyncMe' } } }],
        ['host in ad', { timelineInAd: true }, { tone: 'muted', text: "Waiting for the host's ad" }],
        ['own ad', { mySync: 'ad' as const }, { tone: 'muted', text: "You're in an ad" }],
        ['buffering', { mySync: 'buffering' as const }, { tone: 'muted', text: 'Buffering…' }],
        ['paused', { mySync: 'paused' as const }, { tone: 'muted', text: 'Paused' }],
        ['no report yet', {}, { tone: 'muted', text: 'Waiting for the video…' }],
    ])('statusLine %s', (_name, overrides, expected) => expect(statusLine(sessionWith(overrides), 1)).toMatchObject(expected));

    it('host status has no action when everyone is in sync', () => {
        expect(statusLine(sessionWith({ isHost: true }), 1).action).toBeUndefined();
    });
});
