import { describe, expect, it } from 'vitest';
import { parseThemePref } from './theme';

describe('parseThemePref', () => {
    it('defaults to night and only knows light and dark', () => {
        expect(parseThemePref(undefined)).toBe('dark');
        expect(parseThemePref('system')).toBe('dark');
        expect(parseThemePref('light')).toBe('light');
        expect(parseThemePref('dark')).toBe('dark');
    });
});
