import { describe, expect, it } from 'vitest';
import { DONATE_SNOOZE_MS, shouldShowDonatePrompt } from './donate';

describe('donate prompt', () => {
    it('shows after 30 min, then weekly', () => {
        expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 29 * 60_000, nextAllowedAtMs: null })).toBe(false);
        expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 30 * 60_000, nextAllowedAtMs: null })).toBe(true);
        expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 31 * 60_000, nextAllowedAtMs: 40 * 60_000 })).toBe(false);
        expect(DONATE_SNOOZE_MS).toBe(7 * 24 * 3_600_000);
    });
});
