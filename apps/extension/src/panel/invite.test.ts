import { describe, expect, it } from 'vitest';
import { inviteText, mailtoUrl, whatsappUrl } from './invite';
import { parseRoomCode } from './roomCode';

describe('invite', () => {
    it('builds the invite text', () => {
        expect(inviteText('Jol4I72BE4', 'abc')).toBe(
            '🍕 Watch Pizza Party Invite\n\nRoom Code: Jol4I72BE4\n\nOpen the Watch Pizza Party extension and join with this code!\nGet the extension: https://chromewebstore.google.com/detail/abc',
        );
    });

    it('the invite can be pasted back as a code', () => {
        expect(parseRoomCode(inviteText('Jol4I72BE4', 'abc'))).toBe('Jol4I72BE4');
    });

    it('builds share links', () => {
        expect(whatsappUrl('a b')).toBe('https://wa.me/?text=a%20b');
        expect(mailtoUrl('a b')).toBe('mailto:?subject=Watch%20Pizza%20Party%20Room%20Invite&body=a%20b');
    });
});
