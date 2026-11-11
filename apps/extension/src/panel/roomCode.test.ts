import { describe, expect, it } from 'vitest';
import { parseRoomCode } from './roomCode';

describe('parseRoomCode', () => {
    it.each([
        ['Jol4I72BE4', 'Jol4I72BE4'],
        ['  Jol4I72BE4 ', 'Jol4I72BE4'],
        ['Join my Watch Pizza Party 🍕\nRoom code: Jol4I72BE4\nGet the extension: https://x', 'Jol4I72BE4'],
        ['https://example.com/?room=Jol4I72BE4', 'Jol4I72BE4'],
        ['hi', null],
        ['', null],
        ['has spaces in it', null],
    ])('parseRoomCode(%j)', (input, out) => expect(parseRoomCode(input)).toBe(out));
});
