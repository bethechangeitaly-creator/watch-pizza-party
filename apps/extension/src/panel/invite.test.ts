import { describe, expect, it } from 'vitest';
import { inviteText, mailtoUrl, whatsappUrl } from './invite';

describe('invite', () => {
    it('builds the invite text', () => {
        expect(inviteText('Jol4I72BE4', 'abc')).toBe(
            'Join my Watch Pizza Party 🍕\nRoom code: Jol4I72BE4\nGet the extension: https://chromewebstore.google.com/detail/abc',
        );
    });

    it('builds share links', () => {
        expect(whatsappUrl('a b')).toBe('https://wa.me/?text=a%20b');
        expect(mailtoUrl('a b')).toBe('mailto:?subject=Watch%20Pizza%20Party%20invite&body=a%20b');
    });
});
