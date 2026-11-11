import { afterEach, describe, expect, it } from 'vitest';
import { isAlive, markAlive, probeContentAlive } from './alive';

const g = globalThis as Record<string, unknown>;
afterEach(() => { delete g.__wppContentAlive; });

describe('content-script liveness flag', () => {
    it('a live script is detected', () => {
        const scope: Record<string, unknown> = {};
        markAlive(scope, () => true);
        expect(isAlive(scope)).toBe(true);
    });

    it('an orphaned script left over from before an extension update is not', () => {
        const scope: Record<string, unknown> = {};
        markAlive(scope, () => false);
        expect(isAlive(scope)).toBe(false);
    });

    it('a plain boolean flag does not count as alive', () => {
        expect(isAlive({ __wppContentAlive: true })).toBe(false);
    });

    it('the background probe (self-contained, runs via executeScript) agrees', () => {
        expect(probeContentAlive()).toBe(false);
        markAlive(g, () => false);
        expect(probeContentAlive()).toBe(false);
        markAlive(g, () => true);
        expect(probeContentAlive()).toBe(true);
    });
});
