import { describe, expect, it } from 'vitest';
import type { Timeline } from '@watch-party/shared';
import { applyPrimeAlias, learnPrimeAlias, planViewerNavigation, shouldAcceptHostEvent } from './mediaTab';

const tl = (mediaId = 'dQw4w9WgXcQ'): Timeline => ({
    rev: 1, platform: 'youtube', mediaId, positionSec: 0, anchorServerMs: 0, rate: 1, paused: false, inAd: false, cause: 'media',
});
const KEY = 'youtube:dQw4w9WgXcQ';
const base = { previousKey: null, justBound: false, force: false };

describe('planViewerNavigation', () => {
    it('navigates a freshly bound tab to the canonical url', () => {
        expect(planViewerNavigation({ ...base, timeline: tl(), mediaTab: { tabId: 4, url: 'about:blank' }, justBound: true }))
            .toEqual({ action: 'navigate', tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', key: KEY });
    });

    it('no media tab → none (never another tab)', () => {
        expect(planViewerNavigation({ ...base, timeline: tl(), mediaTab: null, justBound: true })).toEqual({ action: 'none' });
    });

    it('already on the video → none', () => {
        expect(planViewerNavigation({
            ...base, timeline: tl(), mediaTab: { tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5' }, justBound: true,
        })).toEqual({ action: 'none' });
    });

    it('does not pull back a viewer who left the video (same video, any site)', () => {
        for (const url of ['https://www.youtube.com/', 'https://mail.google.com/mail/u/0/']) {
            expect(planViewerNavigation({ ...base, timeline: tl(), mediaTab: { tabId: 4, url }, previousKey: KEY })).toEqual({ action: 'none' });
        }
    });

    it('follows a new video while the tab is on YouTube or Netflix', () => {
        expect(planViewerNavigation({
            ...base, timeline: tl('aqz-KE-bpKQ'), mediaTab: { tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, previousKey: KEY,
        })).toMatchObject({ action: 'navigate', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    });

    it('never takes over another site when the host changes video', () => {
        expect(planViewerNavigation({
            ...base, timeline: tl('aqz-KE-bpKQ'), mediaTab: { tabId: 4, url: 'https://web.whatsapp.com/' }, previousKey: KEY,
        })).toEqual({ action: 'none' });
    });

    it('resync (force) brings the bound tab back from anywhere', () => {
        expect(planViewerNavigation({
            ...base, timeline: tl(), mediaTab: { tabId: 4, url: 'https://mail.google.com/' }, previousKey: KEY, force: true,
        })).toMatchObject({ action: 'navigate', tabId: 4 });
    });

    it('no timeline → none', () => {
        expect(planViewerNavigation({ ...base, timeline: null, mediaTab: { tabId: 4, url: undefined }, justBound: true }))
            .toEqual({ action: 'none' });
    });
});

describe('shouldAcceptHostEvent', () => {
    it('host events only from the bound tab', () => {
        expect(shouldAcceptHostEvent(3, 3)).toBe(true);
        expect(shouldAcceptHostEvent(4, 3)).toBe(false);
        expect(shouldAcceptHostEvent(undefined, 3)).toBe(false);
        expect(shouldAcceptHostEvent(3, null)).toBe(false);
    });
});

describe('Prime Video: the same film under another id after Prime redirects the viewer', () => {
    const HOST = '0NAK6UE1K7JXYEBYPGK9GNKQYB';
    const LOCAL = 'B0DFGH1234';
    const primeTimeline = { rev: 3, platform: 'prime' as const, mediaId: HOST, positionSec: 1859, anchorServerMs: 0, rate: 1, paused: false, inAd: false, cause: 'play' as const };

    it('learns the alias when the tab we just sent to the host film lands on another Prime id', () => {
        const nav = { hostMediaId: HOST, atMs: 1000 };
        expect(learnPrimeAlias({ nav, nowMs: 20_000, timeline: primeTimeline, tabUrl: `https://www.amazon.co.uk/gp/video/detail/${LOCAL}/ref=x` }))
            .toEqual({ hostMediaId: HOST, viewerMediaId: LOCAL });
    });

    it('does not learn from a film the viewer picked themselves later, or from other sites', () => {
        const nav = { hostMediaId: HOST, atMs: 1000 };
        expect(learnPrimeAlias({ nav, nowMs: 200_000, timeline: primeTimeline, tabUrl: `https://www.primevideo.com/detail/${LOCAL}` })).toBeNull();
        expect(learnPrimeAlias({ nav: null, nowMs: 2000, timeline: primeTimeline, tabUrl: `https://www.primevideo.com/detail/${LOCAL}` })).toBeNull();
        expect(learnPrimeAlias({ nav, nowMs: 2000, timeline: primeTimeline, tabUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toBeNull();
        expect(learnPrimeAlias({ nav, nowMs: 2000, timeline: primeTimeline, tabUrl: `https://www.primevideo.com/detail/${HOST}` })).toBeNull();
    });

    it('with the alias the viewer stays put and follows under its own id', () => {
        const alias = { hostMediaId: HOST, viewerMediaId: LOCAL };
        const local = applyPrimeAlias(primeTimeline, alias);
        expect(local.mediaId).toBe(LOCAL);
        expect(planViewerNavigation({ timeline: local, mediaTab: { tabId: 4, url: `https://www.primevideo.com/detail/${LOCAL}` }, previousKey: null, justBound: true, force: true }))
            .toEqual({ action: 'none' });
        expect(applyPrimeAlias({ ...primeTimeline, mediaId: '0OTHERFILM0000000000000000' }, alias).mediaId).toBe('0OTHERFILM0000000000000000');
    });
});
