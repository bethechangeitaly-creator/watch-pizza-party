import { useEffect, useState } from 'react';
import { fetchGifs, type Gif } from './gifs';

export function GifPicker({ serverUrl, onPick }: { serverUrl: string; onPick: (url: string) => void }) {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState<Gif[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

    useEffect(() => {
        let cancelled = false;
        setState('loading');
        const timer = setTimeout(() => {
            void fetchGifs(serverUrl, query.trim()).then((result) => {
                if (cancelled) return;
                if (result === 'unavailable') {
                    setState('unavailable');
                } else {
                    setGifs(result);
                    setState('ready');
                }
            });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, serverUrl]);

    return (
        <div className="flex flex-col gap-2 rounded-control bg-surface-2 p-2">
            <input
                aria-label="Search GIFs"
                placeholder="Search GIFs"
                value={query}
                maxLength={50}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 rounded-control bg-surface px-3 text-body"
            />
            {state === 'unavailable' && <p className="text-meta text-muted">GIFs aren't available right now.</p>}
            {state === 'ready' && gifs.length === 0 && <p className="text-meta text-muted">No GIFs found.</p>}
            <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">
                {gifs.map((gif) => (
                    <button key={gif.id} type="button" aria-label="Send GIF" onClick={() => onPick(gif.url)} className="overflow-hidden rounded-control">
                        <img src={gif.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-full object-cover" />
                    </button>
                ))}
            </div>
            <p className="text-meta text-muted">Powered by GIPHY</p>
        </div>
    );
}
