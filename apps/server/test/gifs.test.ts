import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestServer } from './helpers';

const giphyBody = {
    data: [
        { id: 'a', images: { fixed_height: { url: 'https://media1.giphy.com/media/a/200.gif', width: '356', height: '200' } } },
        { id: 'b', images: { fixed_height: { url: 'https://evil.com/b.gif', width: '1', height: '1' } } },
    ],
};
const okFetch = () => vi.fn(async () => new Response(JSON.stringify(giphyBody)));

let s: Awaited<ReturnType<typeof startTestServer>> | null = null;
afterEach(async () => { await s?.close(); s = null; });

describe('GET /gifs', () => {
    it('proxies search and filters hosts', async () => {
        const fetchImpl = okFetch();
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl });
        const r = await (await fetch(`${s.url}/gifs?q=cats`)).json();
        expect(r.gifs).toEqual([{ id: 'a', url: 'https://media1.giphy.com/media/a/200.gif', width: 356, height: 200 }]);
        const upstream = String(fetchImpl.mock.calls[0][0]);
        expect(upstream).toContain('/v1/gifs/search');
        expect(upstream).toContain('q=cats');
        expect(upstream).toContain('api_key=K');
        expect(upstream).not.toContain('lang=');
    });

    it('caches identical queries', async () => {
        const fetchImpl = okFetch();
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl });
        await fetch(`${s.url}/gifs?q=Cats`);
        await fetch(`${s.url}/gifs?q=cats `);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('503 without key', async () => {
        s = await startTestServer({ fetchImpl: okFetch() });
        const r = await fetch(`${s.url}/gifs?q=cats`);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: 'gifs_unavailable' });
    });

    it('400 on long query', async () => {
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl: okFetch() });
        expect((await fetch(`${s.url}/gifs?q=${'x'.repeat(51)}`)).status).toBe(400);
    });

    it('empty q uses trending', async () => {
        const fetchImpl = okFetch();
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl });
        await fetch(`${s.url}/gifs?q=`);
        expect(String(fetchImpl.mock.calls[0][0])).toContain('/v1/gifs/trending');
    });

    it('502 when giphy fails', async () => {
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl: vi.fn(async () => new Response('nope', { status: 500 })) });
        expect((await fetch(`${s.url}/gifs?q=cats`)).status).toBe(502);
    });

    it('rate limits per IP', async () => {
        s = await startTestServer({ giphyApiKey: 'K', fetchImpl: okFetch() });
        const headers = { 'x-forwarded-for': '7.7.7.7' };
        for (let i = 0; i < 30; i++) await fetch(`${s.url}/gifs?q=q${i}`, { headers });
        expect((await fetch(`${s.url}/gifs?q=last`, { headers })).status).toBe(429);
    });
});
