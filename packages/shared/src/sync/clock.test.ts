import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

describe('ClockSync', () => {
    it('computes offset from one sample', () => {
        const c = new ClockSync();
        c.addSample(1000, 5050, 1100);
        expect(c.offsetMs).toBe(4000);
        expect(c.rttMs).toBe(100);
        expect(c.toServerTime(2000)).toBe(6000);
    });

    it('uses the min-RTT sample', () => {
        const c = new ClockSync();
        c.addSample(0, 4100, 400);
        c.addSample(1000, 5030, 1040);
        expect(c.offsetMs).toBe(4010);
        expect(c.rttMs).toBe(40);
    });

    it('keeps only the last N samples', () => {
        const c = new ClockSync(2);
        c.addSample(0, 4010, 20);
        c.addSample(100, 9200, 400);
        c.addSample(500, 9800, 900);
        expect(c.sampleCount).toBe(2);
        expect(c.rttMs).toBe(300);
    });

    it('ignores negative RTT and has null offset with no samples', () => {
        const c = new ClockSync();
        expect(c.offsetMs).toBeNull();
        expect(c.toServerTime(5)).toBe(5);
        c.addSample(100, 0, 50);
        expect(c.sampleCount).toBe(0);
    });
});
