type RGB = [number, number, number];

/** Mirrors the bg/text tokens in index.css (tokens.test.ts guards those). */
export const THEME_RGB: Record<'light' | 'dark', { bg: RGB; text: RGB }> = {
    light: { bg: [255, 251, 245], text: [43, 36, 32] },
    dark: { bg: [26, 14, 15], text: [245, 233, 228] },
};
const MIX = { light: 0.15, dark: 0.22 };
const FALLBACK: RGB = [242, 107, 58];

export function parseColor(value: string): RGB | null {
    const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)\)$/);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

const lum = (c: RGB) => {
    const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
export function contrast(a: RGB, b: RGB): number {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * t + b[i] * (1 - t))) as RGB;
const css = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** Bubble background tinted with a friend's avatar colour, and a readable name colour. */
export function bubbleTint(hex: string, theme: 'light' | 'dark'): { background: string; name: string } {
    const colour = parseColor(hex) ?? FALLBACK;
    const { bg, text } = THEME_RGB[theme];
    let pct = MIX[theme];
    let background = mix(colour, bg, pct);
    while (contrast(text, background) < 4.5 && pct > 0) {
        pct -= 0.02;
        background = mix(colour, bg, Math.max(pct, 0));
    }
    const toward: RGB = theme === 'light' ? [0, 0, 0] : [255, 255, 255];
    let name = colour;
    for (let step = 0.1; contrast(name, bg) < 4.5 && step <= 1; step += 0.1) name = mix(toward, colour, step);
    return { background: css(background), name: css(name) };
}
