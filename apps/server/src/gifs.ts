import type { RequestHandler } from 'express';
import { isAllowedGifUrl } from '@watch-party/shared';
import { IP_LIMITS, KeyedLimiter, clientIp } from './rateLimit';

export type Gif = { id: string; url: string; width: number; height: number };

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 200;
const QUERY_MAX = 50;
const LIMIT = 12;

type GiphyItem = { id?: unknown; images?: { fixed_height?: { url?: unknown; width?: unknown; height?: unknown } } };

function toGif(item: GiphyItem): Gif | null {
    const image = item.images?.fixed_height;
    const url = typeof image?.url === 'string' ? image.url : '';
    const width = Number(image?.width);
    const height = Number(image?.height);
    if (typeof item.id !== 'string' || !isAllowedGifUrl(url) || !(width > 0) || !(height > 0)) return null;
    return { id: item.id, url, width, height };
}

export function createGifRoute(opts: { apiKey?: string; fetchImpl: typeof fetch; now: () => number; trustProxy: boolean }): RequestHandler {
    const cache = new Map<string, { at: number; gifs: Gif[] }>();
    const limiter = new KeyedLimiter(IP_LIMITS.gifs[0], IP_LIMITS.gifs[1], opts.now);

    return async (req, res) => {
        if (!opts.apiKey) {
            res.status(503).json({ error: 'gifs_unavailable' });
            return;
        }
        const raw = typeof req.query.q === 'string' ? req.query.q : '';
        if (raw.length > QUERY_MAX) {
            res.status(400).json({ error: 'query_too_long' });
            return;
        }
        if (!limiter.take(clientIp(req.headers, req.socket.remoteAddress ?? 'unknown', opts.trustProxy))) {
            res.status(429).json({ code: 'rate_limited' });
            return;
        }

        const q = raw.trim().toLowerCase();
        const cached = cache.get(q);
        if (cached && opts.now() - cached.at < CACHE_TTL_MS) {
            res.json({ gifs: cached.gifs });
            return;
        }

        const params = new URLSearchParams({ api_key: opts.apiKey, limit: String(LIMIT), rating: 'pg-13' });
        if (q) params.set('q', q);
        const endpoint = `https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`;
        try {
            const upstream = await opts.fetchImpl(endpoint);
            if (!upstream.ok) throw new Error(`giphy ${upstream.status}`);
            const body = (await upstream.json()) as { data?: GiphyItem[] };
            const gifs = (body.data ?? []).map(toGif).filter((g): g is Gif => g !== null).slice(0, LIMIT);
            if (cache.size >= CACHE_MAX) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined) cache.delete(oldest);
            }
            cache.set(q, { at: opts.now(), gifs });
            res.json({ gifs });
        } catch {
            res.status(502).json({ error: 'gifs_unavailable' });
        }
    };
}
