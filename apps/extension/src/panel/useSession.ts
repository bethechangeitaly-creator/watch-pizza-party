import { useCallback, useEffect, useState } from 'react';
import type { BackgroundEvent, PanelRequest, PanelResponse, PublicSession, TimelineEntry } from '../lib/messages';
import { ENTRIES_KEY } from '../lib/timeline';

type CachedEntries = { roomId: string | null; entries: TimelineEntry[] };

export function sendRequest(request: PanelRequest): Promise<PanelResponse> {
    return chrome.runtime.sendMessage(request).then(
        (response: PanelResponse | undefined) => response ?? { ok: false, error: 'No response from the extension.' },
        (error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
}

/** Live session state and chat timeline from the background, plus a way to send requests. */
export function useSession(): {
    session: PublicSession | null;
    entries: TimelineEntry[];
    send: (r: PanelRequest) => Promise<PanelResponse>;
} {
    const [session, setSession] = useState<PublicSession | null>(null);
    const [cached, setCached] = useState<CachedEntries>({ roomId: null, entries: [] });
    const send = useCallback((r: PanelRequest) => sendRequest(r), []);

    useEffect(() => {
        const onMessage = (message: BackgroundEvent) => {
            if (message?.type === 'bg.session') setSession(message.state);
            if (message?.type === 'bg.entries') setCached((prev) => ({ ...prev, roomId: null, entries: message.entries }));
        };
        chrome.runtime.onMessage.addListener(onMessage);
        // Presence: while this port is open the panel counts as open (no unread, no bubble).
        const port = chrome.runtime.connect({ name: 'wpp-panel' });

        void sendRequest({ type: 'session.get' }).then((r) => {
            if (r.ok) setSession(r.state);
        });
        void chrome.storage.session.get(ENTRIES_KEY).then((stored) => {
            const value = stored[ENTRIES_KEY] as CachedEntries | undefined;
            if (value && Array.isArray(value.entries)) setCached(value);
        });

        return () => {
            chrome.runtime.onMessage.removeListener(onMessage);
            port.disconnect();
        };
    }, []);

    // Cached entries from storage belong to a room; live ones (roomId null) are always current.
    const entries = cached.roomId === null || cached.roomId === session?.roomId ? cached.entries : [];
    return { session, entries, send };
}
