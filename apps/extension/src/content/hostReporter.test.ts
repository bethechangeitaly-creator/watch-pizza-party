import { describe, expect, it } from 'vitest';
import type { HostPlayerEvent } from '../lib/messages';
import { fakeAdapter, manualClock } from '../test/fakeAdapter';
import { HostReporter, classifyHostChange, type HostSample } from './hostReporter';

const s = (o: Partial<HostSample> = {}): HostSample => ({
    media: { platform: 'youtube', mediaId: 'dQw4w9WgXcQ' }, positionSec: 10, paused: false, rate: 1, inAd: false, atLocalMs: 0, ...o,
});

describe('classifyHostChange', () => {
    it.each([
        [null, s(), 'initial'],
        [s(), s({ media: { platform: 'youtube', mediaId: 'aqz-KE-bpKQ' }, atLocalMs: 250 }), 'media'],
        [s(), s({ inAd: true, atLocalMs: 250 }), 'ad'],
        [s(), s({ paused: true, positionSec: 10.25, atLocalMs: 250 }), 'pause'],
        [s({ paused: true }), s({ paused: false, atLocalMs: 250 }), 'play'],
        [s(), s({ rate: 1.5, positionSec: 10.25, atLocalMs: 250 }), 'rate'],
        [s(), s({ positionSec: 60, atLocalMs: 250 }), 'seek'],
        [s({ paused: true }), s({ paused: true, positionSec: 30, atLocalMs: 250 }), 'seek'],
        [s(), s({ positionSec: 10.26, atLocalMs: 250 }), null],
    ] as const)('classify %#', (prev, next, cause) => expect(classifyHostChange(prev, next)).toBe(cause));
});

describe('HostReporter', () => {
    it('tells the panel when the host must show Prime its time once, and when that is done', () => {
        const clock = manualClock();
        const adapter = fakeAdapter();
        const needs: boolean[] = [];
        const reporter = new HostReporter(adapter, () => {}, clock.now, (v) => needs.push(v));
        adapter.uncalibrated = true;
        reporter.tick();
        reporter.tick();
        adapter.uncalibrated = false;
        reporter.tick();
        expect(needs).toEqual([true, false]);
    });

    const setup = (init?: Parameters<typeof fakeAdapter>[0]) => {
        const clock = manualClock();
        const adapter = fakeAdapter(init);
        const sent: HostPlayerEvent[] = [];
        const needs: boolean[] = [];
        const reporter = new HostReporter(adapter, (e) => sent.push(e), clock.now, (v) => needs.push(v));
        return { clock, adapter, sent, reporter, needs };
    };

    it('host reporter is silent without a media id (YouTube home)', () => {
        const { clock, sent, reporter } = setup({ media: null });
        reporter.tick();
        clock.advance(10_000);
        reporter.tick();
        expect(sent).toEqual([]);
    });

    it('reports the initial state with title and capture time', () => {
        const { clock, sent, reporter } = setup();
        clock.set(1234);
        reporter.tick();
        expect(sent).toEqual([{
            platform: 'youtube', mediaId: 'dQw4w9WgXcQ', title: 'Song', positionSec: 10, capturedAtLocalMs: 1234,
            rate: 1, paused: false, inAd: false, cause: 'initial',
        }]);
    });

    it('heartbeats every 5s while playing, not while paused', () => {
        const { clock, adapter, sent, reporter } = setup();
        reporter.tick();
        for (let i = 0; i < 20; i++) {
            clock.advance(255);
            adapter.snap!.positionSec += 0.255;
            reporter.tick();
        }
        expect(sent.map((e) => e.cause)).toEqual(['initial', 'heartbeat']);
        adapter.snap!.paused = true;
        reporter.tick();
        clock.advance(10_000);
        reporter.tick();
        expect(sent.map((e) => e.cause)).toEqual(['initial', 'heartbeat', 'pause']);
    });

    it('host ad reports the content position, not the ad clock', () => {
        const { clock, adapter, sent, reporter } = setup();
        adapter.snap!.positionSec = 300;
        reporter.tick();
        clock.advance(250);
        adapter.snap = { positionSec: 2, paused: false, rate: 1, buffering: false, inAd: true };
        reporter.tick();
        expect(sent.at(-1)).toMatchObject({ cause: 'ad', inAd: true, positionSec: 300 });
    });

    it('an ad at the start of the next video does not carry over the previous position', () => {
        const { clock, adapter, sent, reporter } = setup();
        adapter.snap!.positionSec = 600;
        reporter.tick();
        clock.advance(250);
        adapter.mediaRef = { platform: 'youtube', mediaId: 'aqz-KE-bpKQ' };
        adapter.snap = { positionSec: 3, paused: false, rate: 1, buffering: false, inAd: true };
        reporter.tick();
        expect(sent.at(-1)).toMatchObject({ cause: 'media', mediaId: 'aqz-KE-bpKQ', inAd: true, positionSec: 0 });
    });

    it('host buffering holds viewers without announcing play/pause', () => {
        const { clock, adapter, sent, reporter } = setup();
        reporter.tick();
        clock.advance(250);
        adapter.snap!.buffering = true;
        reporter.tick();
        clock.advance(3000);
        reporter.tick();
        clock.advance(250);
        adapter.snap!.buffering = false;
        reporter.tick();
        expect(sent.map((e) => [e.cause, e.paused])).toEqual([['initial', false], ['heartbeat', true], ['heartbeat', false]]);
    });
});
