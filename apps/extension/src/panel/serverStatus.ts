import { useCallback, useEffect, useState } from 'react';

export type ServerStatus = 'checking' | 'online' | 'waking' | 'offline';

const WAKING_AFTER_MS = 2500;
const GIVE_UP_MS = 90_000;

/** Pings /health. A sleeping free server takes up to a minute to answer, so this waits long. */
export async function checkServer(serverUrl: string, fetchImpl: typeof fetch = fetch): Promise<'online' | 'offline'> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GIVE_UP_MS);
    try {
        const response = await fetchImpl(`${serverUrl.replace(/\/$/, '')}/health`, { signal: controller.signal, cache: 'no-store' });
        return response.ok ? 'online' : 'offline';
    } catch {
        return 'offline';
    } finally {
        clearTimeout(timer);
    }
}

/** Live server status for the start screen; checking also wakes the server up early. */
export function useServerStatus(serverUrl: string | undefined): { status: ServerStatus; retry: () => void } {
    const [status, setStatus] = useState<ServerStatus>('checking');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!serverUrl) return;
        let done = false;
        setStatus('checking');
        const slow = setTimeout(() => !done && setStatus('waking'), WAKING_AFTER_MS);
        void checkServer(serverUrl).then((result) => {
            done = true;
            clearTimeout(slow);
            setStatus(result);
        });
        return () => {
            done = true;
            clearTimeout(slow);
        };
    }, [serverUrl, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return { status, retry };
}
