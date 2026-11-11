import { describe, expect, it } from 'vitest';
import type { Timeline, ViewerSyncState } from '@watch-party/shared';
import { fakeAdapter, manualClock } from '../test/fakeAdapter';
import { ViewerFollower } from './viewerFollower';

const timeline = (o: Partial<Timeline> = {}): Timeline => ({
    rev: 1, platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 100, anchorServerMs: 0,
    rate: 1, paused: false, inAd: false, cause: 'play', ...o,
});

function setup() {
    const clock = manualClock();
    const adapter = fakeAdapter();
    const reports: Array<{ rev: number; driftSec: number; state: ViewerSyncState; needsClick?: boolean }> = [];
    const follower = new ViewerFollower(adapter, (r) => reports.push(r), clock.now);
    return { clock, adapter, reports, follower };
}

describe('ViewerFollower', () => {
    it('far behind and paused → seek then play', () => {
        const { adapter, follower } = setup();
        follower.setTimeline(timeline(), 0, false);
        adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: false, inAd: false };
        follower.tick();
        expect(adapter.calls).toEqual([['seek', 100.1], ['play']]);
    });

    it('does nothing on a different video', () => {
        const { adapter, reports, follower } = setup();
        adapter.mediaRef = { platform: 'youtube', mediaId: 'aqz-KE-bpKQ' };
        follower.setTimeline(timeline(), 0, false);
        follower.tick();
        expect(adapter.calls).toEqual([]);
        expect(reports).toEqual([]);
    });

    it('host in an ad → viewer pauses and holds', () => {
        const { adapter, follower } = setup();
        follower.setTimeline(timeline({ inAd: true }), 0, false);
        adapter.snap = { positionSec: 100, paused: false, rate: 1, buffering: false, inAd: false };
        follower.tick();
        expect(adapter.calls).toEqual([['pause']]);
    });

    it('viewer in an ad → no corrections, reports ad', () => {
        const { adapter, reports, follower } = setup();
        follower.setTimeline(timeline(), 0, false);
        adapter.snap = { positionSec: 3, paused: false, rate: 1, buffering: false, inAd: true };
        follower.tick();
        expect(adapter.calls).toEqual([]);
        expect(reports.at(-1)?.state).toBe('ad');
    });

    it('force applies once', () => {
        const { clock, adapter, follower } = setup();
        clock.set(10_000);
        follower.setTimeline(timeline({ anchorServerMs: 10_000 }), 0, true);
        adapter.snap = { positionSec: 99.8, paused: false, rate: 1, buffering: false, inAd: false };
        follower.tick();
        follower.tick();
        expect(adapter.calls).toEqual([['seek', 100.1], ['rate', 1.05]]);
    });

    it('reports status on change or every 2s', () => {
        const { clock, adapter, reports, follower } = setup();
        follower.setTimeline(timeline({ paused: true }), 0, false);
        adapter.snap = { positionSec: 100, paused: true, rate: 1, buffering: false, inAd: false };
        follower.tick();
        clock.advance(400);
        follower.tick();
        clock.advance(400);
        follower.tick();
        expect(reports).toHaveLength(1);
        clock.advance(1300);
        follower.tick();
        expect(reports).toHaveLength(2);
        expect(reports[0]).toEqual({ rev: 1, driftSec: 0, state: 'paused', needsClick: false });
    });

    it('uses the clock offset', () => {
        const { adapter, follower } = setup();
        follower.setTimeline(timeline(), 5000, false);
        adapter.snap = { positionSec: 105, paused: false, rate: 1, buffering: false, inAd: false };
        follower.tick();
        expect(adapter.calls).toEqual([]);
    });

    it('records the seek for the cooldown', () => {
        const { clock, adapter, follower } = setup();
        follower.setTimeline(timeline(), 0, false);
        adapter.snap = { positionSec: 90, paused: false, rate: 1, buffering: false, inAd: false };
        follower.tick();
        clock.advance(500);
        follower.tick();
        expect(adapter.calls.filter((c) => c[0] === 'seek')).toHaveLength(1);
    });

    describe('when the viewer has to click the video once (Prime Video)', () => {
        it('an uncalibrated clock: follows play/pause but makes no jumps, and asks for a click', () => {
            const { adapter, reports, follower } = setup();
            adapter.uncalibrated = true;
            follower.setTimeline(timeline(), 0, false);
            adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: false, inAd: false };
            follower.tick();
            expect(adapter.calls).toEqual([['play']]);
            expect(reports.at(-1)?.needsClick).toBe(true);
        });

        it('play blocked by Chrome for 3 s: asks for a click; clears once playing', () => {
            const { adapter, reports, follower, clock } = setup();
            follower.setTimeline(timeline({ positionSec: 10, anchorServerMs: 0 }), 0, false);
            adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: false, inAd: false };
            follower.tick();
            expect(reports.at(-1)?.needsClick ?? false).toBe(false);
            clock.advance(3000);
            adapter.snap = { positionSec: 13, paused: true, rate: 1, buffering: false, inAd: false };
            follower.tick();
            expect(reports.at(-1)?.needsClick).toBe(true);
            adapter.snap = { positionSec: 13, paused: false, rate: 1, buffering: false, inAd: false };
            clock.advance(250);
            follower.tick();
            expect(reports.at(-1)?.needsClick).toBe(false);
        });
    });

    it('a pause during a jump (shown as loading) is not mistaken for Chrome blocking playback', () => {
        const { adapter, reports, follower, clock } = setup();
        follower.setTimeline(timeline({ positionSec: 10, anchorServerMs: 0 }), 0, false);
        adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: true, inAd: false };
        follower.tick();
        clock.advance(5000);
        adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: true, inAd: false };
        follower.tick();
        expect(reports.at(-1)?.needsClick).toBe(false);
    });
});
