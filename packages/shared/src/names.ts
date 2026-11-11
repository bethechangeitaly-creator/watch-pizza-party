export const USERNAME_MAX = 32;

export const AVATAR_PALETTE: ReadonlyArray<{ name: string; hex: string }> = [
    { name: 'Tomato', hex: '#FF6A3D' },
    { name: 'Saffron', hex: '#F5B83D' },
    { name: 'Basil', hex: '#3DD68C' },
    { name: 'Sky', hex: '#3DB8F5' },
    { name: 'Plum', hex: '#8B7CF6' },
    { name: 'Rose', hex: '#F06BB0' },
    { name: 'Chili', hex: '#E0533D' },
    { name: 'Teal', hex: '#2FB5A3' },
    { name: 'Crust', hex: '#C08A5B' },
    { name: 'Slate', hex: '#7A8CA3' },
];

const INGREDIENTS = [
    'Pepperoni', 'Mushroom', 'Olive', 'Onion', 'Basil', 'Sausage',
    'Mozzarella', 'Tomato', 'Ham', 'Bacon', 'Jalapeno', 'Pineapple',
    'Anchovy', 'Garlic', 'Capers', 'Truffle', 'Pesto', 'Hot Honey',
    'Burrata', 'Chili Flake',
];

export function generateRandomName(rand: () => number = Math.random): { name: string; color: string } {
    const colour = AVATAR_PALETTE[Math.floor(rand() * AVATAR_PALETTE.length)];
    const ingredient = INGREDIENTS[Math.floor(rand() * INGREDIENTS.length)];
    return { name: `${colour.name} ${ingredient}`, color: colour.hex };
}

// Control characters, zero-width characters and bidi overrides (used for name spoofing).
const INVISIBLE_RE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

function truncate(value: string, max: number): string {
    return Array.from(value).slice(0, max).join('').trimEnd();
}

export function sanitizeUsername(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return truncate(cleaned, USERNAME_MAX);
}

export function uniqueDisplayName(desired: string, taken: readonly string[]): string {
    const takenLower = new Set(taken.map((name) => name.toLowerCase()));
    if (!takenLower.has(desired.toLowerCase())) return desired;
    for (let n = 2; ; n += 1) {
        const suffix = ` ${n}`;
        const candidate = `${truncate(desired, USERNAME_MAX - suffix.length)}${suffix}`;
        if (!takenLower.has(candidate.toLowerCase())) return candidate;
    }
}
