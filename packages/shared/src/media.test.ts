import { describe, expect, it } from 'vitest';
import { canonicalWatchUrl, extractMedia, isAllowedGifUrl } from './media';

const YT = 'dQw4w9WgXcQ';

describe('extractMedia', () => {
    it.each([
        [`https://www.youtube.com/watch?v=${YT}&t=42s`, { platform: 'youtube', mediaId: YT }],
        [`https://m.youtube.com/watch?v=${YT}`, { platform: 'youtube', mediaId: YT }],
        [`https://youtu.be/${YT}?si=abc`, { platform: 'youtube', mediaId: YT }],
        ['https://www.netflix.com/watch/80100172?trackId=1', { platform: 'netflix', mediaId: '80100172' }],
    ])('extractMedia(%s)', (url, ref) => expect(extractMedia(url)).toEqual(ref));

    it.each([
        'https://www.youtube.com/',
        'https://www.youtube.com/results?search_query=x',
        `https://www.youtube.com/shorts/${YT}`,
        'https://www.netflix.com/browse',
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
        expect(() => canonicalWatchUrl({ platform: 'netflix', mediaId: '../x' })).toThrow('invalid media ref');
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
