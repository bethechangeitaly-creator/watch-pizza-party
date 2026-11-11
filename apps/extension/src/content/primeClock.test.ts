import { describe, expect, it } from 'vitest';
import { PrimeClock } from './primeClock';

const D = 3357; // stream length of the Carrie episode seen on Prime: 3317 s of episode + a 40 s pre-roll

/** Plays the stream from `from` to `to` in 0.25 s steps, showing the ad countdown where `ad` says. */
function play(clock: PrimeClock, from: number, to: number, ad?: { start: number; end: number }) {
    for (let t = from; t <= to; t += 0.25) {
        const inAd = !!ad && t >= ad.start && t < ad.end;
        clock.observe({ streamSec: t, durationSec: D, adRemainingSec: inAd ? Math.ceil(ad!.end - t) : null, labelElapsedSec: null });
    }
}

describe('PrimeClock', () => {
    it('without ads the episode time is the video time', () => {
        const clock = new PrimeClock();
        play(clock, 0, 30);
        expect(clock.toContent(30)).toBeCloseTo(30, 1);
        expect(clock.toStream(30)).toBeCloseTo(30, 1);
    });

    it('takes a watched pre-roll ad out of the time (the 40 s offset measured on Prime)', () => {
        const clock = new PrimeClock();
        play(clock, 0, 127.3, { start: 0, end: 40 });
        expect(clock.toContent(127.3)).toBeCloseTo(87.3, 0); // the player showed 01:27
        expect(clock.toStream(87.3)).toBeCloseTo(127.3, 0);
    });

    it('during an ad the episode time stays where the ad started', () => {
        const clock = new PrimeClock();
        play(clock, 0, 300);
        play(clock, 300, 310, { start: 300, end: 330 });
        expect(clock.toContent(310)).toBeCloseTo(300, 0);
    });

    it('adds up a pre-roll and a mid-roll, and jumps land in the right place', () => {
        const clock = new PrimeClock();
        play(clock, 0, 700, { start: 0, end: 40 });
        play(clock, 700, 760, { start: 640, end: 670 }); // already past it: nothing new
        const mid = new PrimeClock();
        play(mid, 0, 60, { start: 0, end: 40 });
        play(mid, 600, 700, { start: 640, end: 670 }); // 30 s mid-roll at episode 600
        expect(mid.toContent(700)).toBeCloseTo(630, 0);
        expect(mid.toStream(630)).toBeCloseTo(700, 0);
        expect(mid.toStream(100)).toBeCloseTo(140, 0); // before the mid-roll only the pre-roll counts
    });

    it('corrects itself from the time the player shows (an ad it never saw)', () => {
        const clock = new PrimeClock();
        clock.observe({ streamSec: 127.3, durationSec: D, adRemainingSec: null, labelElapsedSec: 87 });
        expect(clock.toContent(127.3)).toBeGreaterThanOrEqual(87);
        expect(clock.toContent(127.3)).toBeLessThan(88);
        expect(clock.toStream(87.5)).toBeCloseTo(127.3, 0);
    });

    it('keeps its precise value when the shown time agrees', () => {
        const clock = new PrimeClock();
        play(clock, 0, 127.3, { start: 0, end: 40 });
        clock.observe({ streamSec: 127.3, durationSec: D, adRemainingSec: null, labelElapsedSec: 87 });
        expect(clock.toContent(127.3)).toBeCloseTo(87.3, 1);
    });

    it('starts over for a new episode', () => {
        const clock = new PrimeClock();
        play(clock, 0, 100, { start: 0, end: 40 });
        clock.observe({ streamSec: 5, durationSec: 2900, adRemainingSec: null, labelElapsedSec: null });
        expect(clock.toContent(5)).toBeCloseTo(5, 1);
    });
});
