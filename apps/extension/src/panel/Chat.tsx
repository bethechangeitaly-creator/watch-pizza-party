import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { TimelineEntry } from '../lib/messages';
import { entryKey } from '../lib/timeline';
import { gifFromText, groupEntries } from './chatModel';
import { Composer } from './Composer';
import { playReceiveTone } from './sounds';
import { bubbleTint } from './tint';
import { Avatar } from './ui/Avatar';

const NEAR_BOTTOM_PX = 80;
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Chat(props: {
    entries: TimelineEntry[];
    meUserId: string | null;
    soundsEnabled: boolean;
    onSend: (text: string) => void;
    serverUrl: string;
    gifsAvailable: boolean;
}) {
    const { entries, meUserId } = props;
    const rows = useMemo(() => groupEntries(entries, meUserId), [entries, meUserId]);
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
                        return (
                            <p key={row.key} className="mx-auto max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-meta text-muted">
                                {row.text}
                            </p>
                        );
                    }
                    const light = bubbleTint(row.avatarColor, 'light');
                    const dark = bubbleTint(row.avatarColor, 'dark');
                    const vars = { '--tl': light.background, '--td': dark.background, '--nl': light.name, '--nd': dark.name } as CSSProperties;
                    return (
                        <article key={row.key} className={`flex gap-2 ${row.mine ? 'flex-row-reverse' : ''}`} style={vars}>
                            {!row.mine && <Avatar name={row.username} color={row.avatarColor} />}
                            <div className={`flex min-w-0 max-w-[85%] flex-col gap-1 ${row.mine ? 'items-end' : 'items-start'}`}>
                                <header className="flex items-baseline gap-2 px-1">
                                    <span className={`truncate text-meta font-bold ${row.mine ? 'text-muted' : 'text-[var(--nl)] dark:text-[var(--nd)]'}`}>
                                        {row.mine ? 'You' : row.username}
                                    </span>
                                    <time className="text-meta text-muted">{time(row.messages[0].timestamp)}</time>
                                </header>
                                {row.messages.map((m) => {
                                    const gif = gifFromText(m.text);
                                    if (gif) {
                                        return <img key={m.id} src={gif} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="max-h-40 rounded-card" />;
                                    }
                                    return (
                                        <p
                                            key={m.id}
                                            data-bubble
                                            className={`whitespace-pre-wrap break-words rounded-card px-3 py-1.5 text-body ${
                                                row.mine
                                                    ? 'rounded-tr-[5px] bg-accent-strong text-accent-fg'
                                                    : 'rounded-tl-[5px] bg-[var(--tl)] text-text dark:bg-[var(--td)]'
                                            }`}
                                        >
                                            {m.text}
                                        </p>
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
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-accent-strong px-3 py-1 text-meta font-bold text-accent-fg"
                >
                    New messages
                </button>
            )}
            <Composer onSend={props.onSend} serverUrl={props.serverUrl} gifsAvailable={props.gifsAvailable} />
        </section>
    );
}
