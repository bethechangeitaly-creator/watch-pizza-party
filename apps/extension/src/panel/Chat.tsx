import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { TimelineEntry } from '../lib/messages';
import { entryKey } from '../lib/timeline';
import { gifFromText, groupEntries } from './chatModel';
import { Composer } from './Composer';
import { DONATE_URL } from './donate';
import { playReceiveTone } from './sounds';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';

const NEAR_BOTTOM_PX = 80;
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Chat(props: {
    entries: TimelineEntry[];
    meUserId: string | null;
    soundsEnabled: boolean;
    onSend: (text: string) => void;
    serverUrl: string;
    gifsAvailable: boolean;
    donate: boolean;
    onDonateClose: () => void;
}) {
    const { entries, meUserId } = props;
    const rows = useMemo(() => groupEntries(entries, meUserId, { donate: props.donate }), [entries, meUserId, props.donate]);
    const listRef = useRef<HTMLDivElement>(null);
    const wasNearBottom = useRef(true);
    const [unseen, setUnseen] = useState(false);
    const lastKey = useRef<string | null>(null);

    // Chime for new messages from others (never for the history loaded on open).
    useEffect(() => {
        const last = entries[entries.length - 1];
        const key = last ? entryKey(last) : null;
        if (lastKey.current !== null && key !== lastKey.current && last?.kind === 'chat' && last.message.userId !== meUserId && props.soundsEnabled) {
            playReceiveTone();
        }
        lastKey.current = key;
    }, [entries, meUserId, props.soundsEnabled]);

    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el) return;
        if (wasNearBottom.current) {
            el.scrollTop = el.scrollHeight;
            setUnseen(false);
        } else {
            setUnseen(true);
        }
    }, [rows]);

    const onScroll = () => {
        const el = listRef.current;
        if (!el) return;
        wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        if (wasNearBottom.current) setUnseen(false);
    };

    return (
        <section aria-label="Chat" className="relative flex min-h-0 flex-1 flex-col">
            <div ref={listRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
                {rows.length === 0 && <p className="m-auto text-meta text-muted">No messages yet. Say hi!</p>}
                {rows.map((row) => {
                    if (row.kind === 'system') {
                        return <p key={row.key} className="truncate text-center text-meta text-muted">{row.text}</p>;
                    }
                    if (row.kind === 'donate') {
                        return (
                            <div key={row.key} className="flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-meta text-muted">
                                <span className="flex-1">
                                    Enjoying the party? The Pizza Server runs on donations.{' '}
                                    <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent">Donate a slice</a>
                                </span>
                                <IconButton label="Dismiss" onClick={props.onDonateClose}>
                                    <X size={14} />
                                </IconButton>
                            </div>
                        );
                    }
                    return (
                        <article key={row.key} className="flex gap-2">
                            <Avatar name={row.username} color={row.avatarColor} />
                            <div className="min-w-0 flex-1">
                                <header className="flex items-baseline gap-2">
                                    <span className="truncate text-body font-semibold">{row.mine ? 'You' : row.username}</span>
                                    <time className="text-meta text-muted">{time(row.messages[0].timestamp)}</time>
                                </header>
                                {row.messages.map((m) => {
                                    const gif = gifFromText(m.text);
                                    return gif ? (
                                        <img key={m.id} src={gif} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="mt-1 max-h-40 rounded-control" />
                                    ) : (
                                        <p key={m.id} className="whitespace-pre-wrap break-words text-body">{m.text}</p>
                                    );
                                })}
                            </div>
                        </article>
                    );
                })}
            </div>
            {unseen && (
                <button
                    type="button"
                    onClick={() => {
                        const el = listRef.current;
                        if (el) el.scrollTop = el.scrollHeight;
                        wasNearBottom.current = true;
                        setUnseen(false);
                    }}
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-surface-2 px-3 py-1 text-meta font-medium text-text"
                >
                    New messages
                </button>
            )}
            <Composer onSend={props.onSend} serverUrl={props.serverUrl} gifsAvailable={props.gifsAvailable} />
        </section>
    );
}
