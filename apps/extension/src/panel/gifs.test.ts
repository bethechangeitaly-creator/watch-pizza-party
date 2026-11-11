import { describe, expect, it, vi } from 'vitest';
import { fetchGifs } from './gifs';

describe('fetchGifs', () => {
    it('maps 503 to unavailable', async () => {
        const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
        expect(await fetchGifs('https://s', '', fetchImpl)).toBe('unavailable');
    });

    it('returns gifs and encodes the query', async () => {
        const gifs = [{ id: 'a', url: 'https://media1.giphy.com/a.gif', width: 200, height: 100 }];
        const fetchImpl = vi.fn(async () => Response.json({ gifs }));
        expect(await fetchGifs('https://s', 'pizza time', fetchImpl)).toEqual(gifs);
        expect(fetchImpl).toHaveBeenCalledWith('https://s/gifs?q=pizza%20time');
    });

    it('treats network failure as unavailable', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
        expect(await fetchGifs('https://s', 'x', fetchImpl)).toBe('unavailable');
    });
});
