export type Gif = { id: string; url: string; width: number; height: number };

export async function fetchGifs(serverUrl: string, q: string, fetchImpl: typeof fetch = fetch): Promise<Gif[] | 'unavailable'> {
    try {
        const res = await fetchImpl(`${serverUrl}/gifs?q=${encodeURIComponent(q)}`);
        if (!res.ok) return 'unavailable';
        const body = (await res.json()) as { gifs?: Gif[] };
        return Array.isArray(body.gifs) ? body.gifs : 'unavailable';
    } catch {
        return 'unavailable';
    }
}
