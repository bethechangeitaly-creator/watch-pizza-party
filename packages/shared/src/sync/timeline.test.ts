import { describe, expect, it } from 'vitest';
import type { Timeline } from '../protocol';
import { expectedPositionSec, isTimelinePaused } from './timeline';

const t: Timeline = {
    rev: 1, platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 10, anchorServerMs: 1000,
    rate: 1, paused: false, inAd: false, cause: 'play',
};

describe('expectedPositionSec', () => {
    it('advances while playing', () => expect(expectedPositionSec(t, 3500)).toBe(12.5));
    it('scales by rate', () => expect(expectedPositionSec({ ...t, rate: 1.5 }, 3500)).toBe(13.75));
    it('is frozen when paused', () => expect(expectedPositionSec({ ...t, paused: true }, 9000)).toBe(10));
    it('is frozen during the host ad', () => expect(expectedPositionSec({ ...t, inAd: true }, 9000)).toBe(10));
    it('never runs backwards', () => expect(expectedPositionSec(t, 500)).toBe(10));
});

describe('isTimelinePaused', () => {
    it('treats the host ad as paused', () => {
        expect(isTimelinePaused({ ...t, inAd: true })).toBe(true);
        expect(isTimelinePaused({ ...t, paused: true })).toBe(true);
        expect(isTimelinePaused(t)).toBe(false);
    });
});
