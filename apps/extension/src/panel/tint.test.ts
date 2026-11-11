import { describe, expect, it } from 'vitest';
import { AVATAR_PALETTE } from '@watch-party/shared';
import { THEME_RGB, bubbleTint, contrast, parseColor } from './tint';

describe.each(['light', 'dark'] as const)('bubbleTint (%s)', (theme) => {
    it.each(AVATAR_PALETTE.map((c) => [c.name, c.hex]))('%s keeps text and name readable', (_name, hex) => {
        const tint = bubbleTint(hex, theme);
        expect(contrast(THEME_RGB[theme].text, parseColor(tint.background)!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(parseColor(tint.name)!, THEME_RGB[theme].bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('falls back for a malformed colour', () => {
        const tint = bubbleTint('not-a-colour', theme);
        expect(parseColor(tint.background)).not.toBeNull();
    });
});
