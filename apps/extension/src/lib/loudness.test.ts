import { describe, expect, it } from 'vitest';
import { loudnessSettings } from './loudness';

const db = (linear: number) => 20 * Math.log10(linear);

describe('loudnessSettings (volume boost)', () => {
    it('leaves the sound untouched at or below 100 %', () => {
        expect(loudnessSettings(1)).toEqual({ threshold: 0, ratio: 1, knee: 0, makeup: 1 });
        expect(loudnessSettings(0.5).makeup).toBe(0.5);
        expect(loudnessSettings(0).makeup).toBe(0);
    });

    it('600 % evens out the film and lifts it far more than a plain gain would', () => {
        const max = loudnessSettings(6);
        expect(max.ratio).toBeGreaterThan(4);
        expect(max.threshold).toBeLessThan(-30);
        expect(db(max.makeup)).toBeGreaterThan(25); // a plain 600 % gain is only +15.6 dB
    });

    it('gets stronger step by step', () => {
        const steps = [1, 1.5, 2, 3, 4, 5, 6].map((g) => db(loudnessSettings(g).makeup));
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    });
});
