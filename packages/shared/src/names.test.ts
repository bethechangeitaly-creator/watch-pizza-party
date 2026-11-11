import { describe, expect, it } from 'vitest';
import { AVATAR_PALETTE, generateRandomName, sanitizeUsername, uniqueDisplayName } from './names';

describe('sanitizeUsername', () => {
    it('sanitizes', () => {
        expect(sanitizeUsername('  Marco\u0000  Rossi ')).toBe('Marco Rossi');
        expect(sanitizeUsername('x'.repeat(40))).toHaveLength(32);
        expect(sanitizeUsername('   ')).toBeNull();
        expect(sanitizeUsername(42)).toBeNull();
    });
});

describe('uniqueDisplayName', () => {
    it('dedupes display names case-insensitively', () => {
        expect(uniqueDisplayName('Marco', ['marco'])).toBe('Marco 2');
        expect(uniqueDisplayName('Marco', ['Marco', 'Marco 2'])).toBe('Marco 3');
        expect(uniqueDisplayName('Luca', ['Marco'])).toBe('Luca');
        expect(uniqueDisplayName('x'.repeat(32), ['x'.repeat(32)]).length).toBeLessThanOrEqual(32);
    });
});

describe('generateRandomName', () => {
    it('generates "<Colour> <Ingredient>" with the palette colour', () => {
        const { name, color } = generateRandomName(() => 0);
        expect(name).toBe(`${AVATAR_PALETTE[0].name} Pepperoni`);
        expect(color).toBe(AVATAR_PALETTE[0].hex);
    });
});
