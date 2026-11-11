import { describe, expect, it } from 'vitest';
import { canonicalWatchUrl, extractMedia, isAllowedGifUrl, isSupportedSite, platformName } from './media';

const YT = 'dQw4w9WgXcQ';

describe('extractMedia', () => {
    it.each([
        [`https://www.youtube.com/watch?v=${YT}&t=42s`, { platform: 'youtube', mediaId: YT }],
        [`https://m.youtube.com/watch?v=${YT}`, { platform: 'youtube', mediaId: YT }],
        [`https://youtu.be/${YT}?si=abc`, { platform: 'youtube', mediaId: YT }],
        ['https://www.netflix.com/watch/80100172?trackId=1', { platform: 'netflix', mediaId: '80100172' }],
        ['https://www.primevideo.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP', { platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' }],
        ['https://www.primevideo.com/detail/0FTOABCDEFGHIJKLMNOPQRG5YD/ref=atv_dp?autoplay=1&t=0', { platform: 'prime', mediaId: '0FTOABCDEFGHIJKLMNOPQRG5YD' }],
        ['https://www.primevideo.com/-/it/detail/0L8YQ591BLZ0VTAHS228HDGRIP', { platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' }],
        ['https://www.primevideo.com/region/eu/detail/0L8YQ591BLZ0VTAHS228HDGRIP', { platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' }],
        ['https://www.primevideo.com/detail/Carrie/0L8YQ591BLZ0VTAHS228HDGRIP', { platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' }],
        ['https://www.amazon.it/gp/video/detail/B0DFGH1234/ref=x', { platform: 'prime', mediaId: 'B0DFGH1234' }],
        ['https://www.amazon.com/gp/video/detail/0L8YQ591BLZ0VTAHS228HDGRIP', { platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' }],
    ])('extractMedia(%s)', (url, ref) => expect(extractMedia(url)).toEqual(ref));

    it.each([
        'https://www.youtube.com/',
        'https://www.youtube.com/results?search_query=x',
        `https://www.youtube.com/shorts/${YT}`,
        'https://www.netflix.com/browse',
        'https://www.primevideo.com/',
        'https://www.primevideo.com/detail/short',
        'https://www.amazon.it/dp/B0DFGH1234',
        'https://evil.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP',
        'https://primevideo.com.evil.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP',
        'https://www.amazon.evil.com/gp/video/detail/B0DFGH1234',
        `https://evil.com/watch?v=${YT}`,
        `https://youtube.com.evil.com/watch?v=${YT}`,
        'https://www.youtube.com/watch?v=short',
        'javascript:alert(1)',
        '',
    ])('extractMedia(%s) is null', (url) => expect(extractMedia(url)).toBeNull());
});

describe('canonicalWatchUrl', () => {
    it('builds canonical urls', () => {
        expect(canonicalWatchUrl({ platform: 'youtube', mediaId: YT })).toBe(`https://www.youtube.com/watch?v=${YT}`);
        expect(canonicalWatchUrl({ platform: 'netflix', mediaId: '80100172' })).toBe('https://www.netflix.com/watch/80100172');
        expect(canonicalWatchUrl({ platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' })).toBe('https://www.primevideo.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP?autoplay=1&t=0');
        expect(() => canonicalWatchUrl({ platform: 'netflix', mediaId: '../x' })).toThrow('invalid media ref');
        expect(() => canonicalWatchUrl({ platform: 'prime', mediaId: '../x' })).toThrow('invalid media ref');
    });
});

describe('isAllowedGifUrl', () => {
    it('allows only https giphy cdn gifs', () => {
        expect(isAllowedGifUrl('https://media2.giphy.com/media/abc/giphy.gif')).toBe(true);
        expect(isAllowedGifUrl('https://i.giphy.com/abc.gif')).toBe(true);
        expect(isAllowedGifUrl('http://media.giphy.com/a.gif')).toBe(false);
        expect(isAllowedGifUrl('https://evil.com/a.gif')).toBe(false);
        expect(isAllowedGifUrl('https://media.giphy.com.evil.com/a.gif')).toBe(false);
    });
});

describe('isSupportedSite', () => {
    it.each([
        ['https://www.youtube.com/', true],
        ['https://m.youtube.com/results?search_query=x', true],
        ['https://www.netflix.com/browse', true],
        ['https://youtu.be/dQw4w9WgXcQ', true],
        ['https://www.primevideo.com/', true],
        ['https://www.amazon.it/gp/video/storefront', true],
        ['https://www.amazon.it/dp/B0DFGH1234', false],
        ['https://www.amazon.evil.com/gp/video/detail/B0DFGH1234', false],
        ['https://mail.google.com/mail/u/0/', false],
        ['https://web.whatsapp.com/', false],
        ['https://youtube.com.evil.com/', false],
        ['chrome://newtab/', false],
        [undefined, false],
    ])('isSupportedSite(%s)', (url, ok) => expect(isSupportedSite(url)).toBe(ok));
});

describe('platformName', () => {
    it('names the platforms for people', () => {
        expect(platformName('youtube')).toBe('YouTube');
        expect(platformName('netflix')).toBe('Netflix');
        expect(platformName('prime')).toBe('Prime Video');
    });
});
