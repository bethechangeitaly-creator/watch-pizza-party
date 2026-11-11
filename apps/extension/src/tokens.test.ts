import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, 'index.css'), 'utf8');
const NAMES = ['bg', 'surface', 'surface-2', 'text', 'muted', 'accent', 'accent-strong', 'accent-fg', 'cheese', 'cheese-fg',
    'ok', 'ok-fg', 'warn', 'warn-fg', 'bad', 'bad-fg', 'invite', 'invite-fg', 'wa', 'wa-fg', 'mail', 'mail-fg'];

function block(theme: 'light' | 'dark'): Record<string, number[]> {
    const re = theme === 'dark'
        ? /:root\[data-theme='dark'\]\s*\{([^}]*)\}/
        : /:root\[data-theme='light'\]\s*\{([^}]*)\}/;
    const body = css.match(re)?.[1] ?? '';
    const out: Record<string, number[]> = {};
    for (const m of body.matchAll(/--([\w-]+):\s*([\d.\s]+);/g)) out[m[1]] = m[2].trim().split(/\s+/).map(Number);
    return out;
}

const lum = ([r, g, b]: number[]) => {
    const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe.each(['light', 'dark'] as const)('%s theme tokens', (theme) => {
    const t = block(theme);

    it('defines every token', () => {
        expect(NAMES.filter((n) => !t[n])).toEqual([]);
    });

    it.each([
        ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface-2'], ['ok-fg', 'ok'], ['cheese-fg', 'cheese'],
        ['invite-fg', 'invite'], ['wa-fg', 'wa'], ['mail-fg', 'mail'], ['bad-fg', 'bad'], ['warn-fg', 'warn'], ['accent-fg', 'accent-strong'],
    ])('%s on %s is at least 4.5:1', (fg, bg) => {
        expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
});
