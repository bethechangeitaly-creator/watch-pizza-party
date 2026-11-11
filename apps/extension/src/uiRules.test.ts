import { readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

const RULES: Array<[RegExp, string]> = [
    [/text-\[\d+px\]/, 'arbitrary text size (use text-meta/body/title/display)'],
    [/bg-gradient-to-/, 'gradient'],
    [/shadow-\w+-\d{3}\//, 'coloured glow shadow'],
    [/tracking-wid/, 'wide letter-spacing'],
    [/\buppercase\b/, 'uppercase label'],
    [/isLightMode/, 'per-class theme ternary (use tokens)'],
];
const HEX = /#[0-9a-fA-F]{6}\b/;
const HEX_ALLOWED = ['src/index.css', 'src/content/bubble.ts'];

function files(target: string): string[] {
    const full = path.join(root, target);
    if (!statSync(full).isDirectory()) return [target];
    return readdirSync(full).flatMap((name) => files(path.join(target, name)));
}

export function violations(targets: string[]): string[] {
    const found: string[] = [];
    for (const file of targets.flatMap(files)) {
        if (!/\.(ts|tsx|css)$/.test(file) || /\.test\.tsx?$/.test(file) || file.startsWith('src/test/')) continue;
        const code = readFileSync(path.join(root, file), 'utf8');
        for (const [pattern, why] of RULES) if (pattern.test(code)) found.push(`${file}: ${why}`);
        if (!HEX_ALLOWED.includes(file) && HEX.test(code)) found.push(`${file}: raw hex colour (use tokens)`);
    }
    return found;
}

describe('UI rules', () => {
    it('all extension code follows the UI rules', () => {
        expect(violations(['src'])).toEqual([]);
    });
});
