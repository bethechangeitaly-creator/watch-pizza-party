import { describe, expect, it } from 'vitest';
import type { Timeline } from '@watch-party/shared';
import { planViewerNavigation, shouldAcceptHostEvent } from './mediaTab';

const tl = (mediaId = 'dQw4w9WgXcQ'): Timeline => ({
    rev: 1, platform: 'youtube', mediaId, positionSec: 0, anchorServerMs: 0, rate: 1, paused: false, inAd: false, cause: 'media',
});

describe('planViewerNavigation', () => {
    it('navigates a bound tab to the canonical url', () => {
        expect(planViewerNavigation({ timeline: tl(), mediaTab: { tabId: 4, url: 'https://www.youtube.com/' }, lastNavigatedKey: null, force: false }))
            .toEqual({ action: 'navigate', tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', key: 'youtube:dQw4w9WgXcQ' });
    });

    it('no media tab → none (never another tab)', () => {
        expect(planViewerNavigation({ timeline: tl(), mediaTab: null, lastNavigatedKey: null, force: false })).toEqual({ action: 'none' });
    });

    it('already on the video → none', () => {
        expect(planViewerNavigation({
            timeline: tl(), mediaTab: { tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5' }, lastNavigatedKey: null, force: false,
        })).toEqual({ action: 'none' });
    });

    it('navigates once per media unless forced', () => {
        const args = { timeline: tl(), mediaTab: { tabId: 4, url: 'https://example.com/' }, lastNavigatedKey: 'youtube:dQw4w9WgXcQ' };
        expect(planViewerNavigation({ ...args, force: false })).toEqual({ action: 'none' });
        expect(planViewerNavigation({ ...args, force: true })).toMatchObject({ action: 'navigate', tabId: 4 });
    });

    it('a new video navigates again', () => {
        expect(planViewerNavigation({
            timeline: tl('aqz-KE-bpKQ'), mediaTab: { tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
            lastNavigatedKey: 'youtube:dQw4w9WgXcQ', force: false,
        })).toMatchObject({ action: 'navigate', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    });

    it('no timeline → none', () => {
        expect(planViewerNavigation({ timeline: null, mediaTab: { tabId: 4, url: undefined }, lastNavigatedKey: null, force: false }))
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
