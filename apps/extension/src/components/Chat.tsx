import React, { useEffect, useRef, useState } from 'react';
import { Room, WSMessage } from '@watch-party/shared';
import { Send, Info, Play, Pause, FastForward, AlertTriangle, RefreshCw, Smile, Image as ImageIcon } from 'lucide-react';

interface ChatProps {
    room: Room;
    username: string;
    incomingMessage: WSMessage | null;
    messageHistory: WSMessage[];
    messageHistoryRoomId: string | null;
    onSendChat: (text: string) => void;
    soundsEnabled: boolean;
    showViewerSyncEvents?: boolean;
    theme?: 'dark' | 'light';
}

type TimelineEventIcon = 'info' | 'play' | 'pause' | 'seek' | 'warning' | 'sync';

type TimelineItem =
    | {
        type: 'message';
        data: {
            username: string;
            avatarColor: string;
            text: string;
        };
        timestamp: number;
    }
    | {
        type: 'event';
        data: {
            text: string;
            user: string;
            icon?: TimelineEventIcon;
            kind?: string;
        };
        timestamp: number;
    };

const EMOJI_OPTIONS = [
    '😀', '😂', '😍', '🥳', '🔥', '👏', '😅', '🤝', '🎬', '🍿', '🚀', '💯',
    '❤️', '🙌', '🤯', '😎', '🤩', '🥲', '🤖', '😈', '😴', '😡', '🤔', '🫶',
    '🫡', '🎉', '🕺', '💃', '💥', '✨', '🌈', '⚡', '🍕', '☕', '🍻', '🎮'
];
const GIPHY_PUBLIC_API_KEY = 'wcKaCCAMzAuGQEWt4YDIhnuzOHNKZn8H';

function toReliableGifUrl(rawUrl: string | undefined): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const safe = rawUrl.trim();
    if (!safe) return null;

    const normalized = safe.startsWith('//') ? `https:${safe}` : safe;
    if (!/^https?:\/\//i.test(normalized)) return null;
    if (!/\.gif(\?|$)/i.test(normalized)) return null;
    return normalized;
}

function getGifUrlFromText(text: string): string | null {
    const matches = text.match(/https?:\/\/\S+/gi);
    if (!matches) return null;

    for (const raw of matches) {
        const clean = raw.replace(/[),.;!?]+$/, '');
        const lowered = clean.toLowerCase();
        const isGifFile = /\.gif(\?|$)/i.test(lowered);
        const isGifHost =
            lowered.includes('giphy.com') ||
            lowered.includes('i.giphy.com') ||
            lowered.includes('media.tenor.com');
        if (isGifFile || isGifHost) {
            return clean;
        }
    }
    return null;
}

function stripUrlFromText(text: string, url: string | null): string {
    if (!url) return text;
    return text.replace(url, '').trim();
}

async function fetchGiphyGifs(keyword: string, limit = 8): Promise<string[]> {
    const query = keyword.trim();
    if (!query) return [];

    const searchEndpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(
        GIPHY_PUBLIC_API_KEY
    )}&q=${encodeURIComponent(query)}&limit=${Math.max(limit * 2, 20)}&rating=pg-13&lang=it`;
    const trendingEndpoint = `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(
        GIPHY_PUBLIC_API_KEY
    )}&limit=${Math.max(limit * 2, 20)}&rating=pg-13`;

    type GiphyImageSet = {
        original?: { url?: string };
        fixed_height?: { url?: string };
        fixed_width?: { url?: string };
        fixed_height_downsampled?: { url?: string };
        downsized?: { url?: string };
        downsized_large?: { url?: string };
        preview_gif?: { url?: string };
    };
    type GiphyItem = { id?: string; images?: GiphyImageSet };
    type GiphyResponse = { data?: GiphyItem[] };

    const pickGifUrl = (item: GiphyItem): string | null => {
        return (
            toReliableGifUrl(item.images?.fixed_height?.url) ||
            toReliableGifUrl(item.images?.fixed_width?.url) ||
            toReliableGifUrl(item.images?.fixed_height_downsampled?.url) ||
            toReliableGifUrl(item.images?.downsized?.url) ||
            toReliableGifUrl(item.images?.downsized_large?.url) ||
            toReliableGifUrl(item.images?.preview_gif?.url) ||
            toReliableGifUrl(item.images?.original?.url)
        );
    };

    const collectUnique = (items: GiphyItem[], target: number, existing: string[] = []): string[] => {
        const out = [...existing];
        const seenIds = new Set<string>();
        const seenUrls = new Set<string>(existing);
        for (const item of items) {
            const id = (item.id || '').trim();
            const url = pickGifUrl(item);
            if (!url) continue;
            if (id && seenIds.has(id)) continue;
            if (seenUrls.has(url)) continue;
            if (id) seenIds.add(id);
            seenUrls.add(url);
            out.push(url);
            if (out.length >= target) break;
        }
        return out;
    };

    try {
        const searchResponse = await fetch(searchEndpoint, { method: 'GET' });
        const searchItems = searchResponse.ok ? ((await searchResponse.json()) as GiphyResponse).data || [] : [];
        let results = collectUnique(searchItems, limit);

        if (results.length < Math.min(limit, 5)) {
            const trendingResponse = await fetch(trendingEndpoint, { method: 'GET' });
            const trendingItems = trendingResponse.ok ? ((await trendingResponse.json()) as GiphyResponse).data || [] : [];
            results = collectUnique(trendingItems, Math.max(limit, 5), results);
        }

        return results.slice(0, Math.max(limit, 5));
    } catch {
        return [];
    }
}

function initialTimeline(): TimelineItem[] {
    return [{ type: 'event', data: { text: 'Room joined! You are watching together.', user: 'System' }, timestamp: Date.now() }];
}

function resolveSystemEventIcon(kind: string): TimelineEventIcon {
    if (kind === 'host.play') return 'play';
    if (kind === 'host.pause') return 'pause';
    if (kind === 'host.seek') return 'seek';
    if (kind === 'host.sync_forced') return 'sync';
    if (kind.startsWith('viewer.')) return 'warning';
    return 'info';
}

function getTimelineDedupKey(message: WSMessage): string | null {
    if (message.type === 'chat.message') {
        return `chat:${message.payload.id}`;
    }

    if (message.type === 'sync.system_event') {
        const actor = message.payload.username || 'System';
        return `sync.system:${message.payload.kind}:${message.payload.timestamp}:${actor}:${message.payload.text}`;
    }

    return null;
}

function toTimelineItem(message: WSMessage): TimelineItem | null {
    if (message.type === 'chat.message') {
        return {
            type: 'message',
            data: {
                username: message.payload.username,
                avatarColor: message.payload.avatarColor,
                text: message.payload.text
            },
            timestamp: message.payload.timestamp || Date.now()
        };
    }

    if (message.type === 'sync.system_event') {
        return {
            type: 'event',
            data: {
                text: message.payload.text,
                user: message.payload.username || 'System',
                icon: resolveSystemEventIcon(message.payload.kind),
                kind: message.payload.kind
            },
            timestamp: message.payload.timestamp || Date.now()
        };
    }

    return null;
}

export function Chat({
    room,
    username,
    incomingMessage,
    messageHistory,
    messageHistoryRoomId,
    onSendChat,
    soundsEnabled,
    showViewerSyncEvents = false,
    theme = 'dark'
}: ChatProps) {
    const isLightMode = theme === 'light';
    const [text, setText] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifQuery, setGifQuery] = useState('');
    const [gifLoading, setGifLoading] = useState(false);
    const [gifError, setGifError] = useState('');
    const [gifResults, setGifResults] = useState<string[]>([]);
    const [pendingGifUrl, setPendingGifUrl] = useState<string | null>(null);
    const [brokenTimelineGifs, setBrokenTimelineGifs] = useState<Set<string>>(new Set());
    const [timeline, setTimeline] = useState<TimelineItem[]>(() => initialTimeline());
    const scrollRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const prevParticipants = useRef<string[]>(room.participants.map((participant) => participant.id));
    const participantNamesById = useRef<Map<string, string>>(
        new Map(room.participants.map((participant) => [participant.id, participant.username]))
    );
    const prevHostId = useRef<string>(room.hostId);
    const seenMessageKeys = useRef<Set<string>>(new Set());

    const playChatTone = (kind: 'send' | 'receive') => {
        if (!soundsEnabled) return;
        try {
            const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;

            if (!audioContextRef.current) {
                audioContextRef.current = new AudioCtx();
            }
            const context = audioContextRef.current;
            if (!context) return;
            if (context.state === 'suspended') {
                void context.resume();
            }

            const now = context.currentTime;
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();
            const filter = context.createBiquadFilter();

            filter.type = 'lowpass';
            filter.frequency.value = kind === 'send' ? 1800 : 1450;

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(kind === 'send' ? 520 : 430, now);
            oscillator.frequency.exponentialRampToValueAtTime(kind === 'send' ? 760 : 560, now + 0.08);

            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.exponentialRampToValueAtTime(kind === 'send' ? 0.035 : 0.028, now + 0.015);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

            oscillator.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start(now);
            oscillator.stop(now + 0.17);
        } catch {
            // Best effort only.
        }
    };

    useEffect(() => {
        setTimeline(initialTimeline());
        setBrokenTimelineGifs(new Set());
        seenMessageKeys.current = new Set();
        prevParticipants.current = room.participants.map((participant) => participant.id);
        prevHostId.current = room.hostId;
        participantNamesById.current = new Map(room.participants.map((participant) => [participant.id, participant.username]));
    }, [room.id]);

    useEffect(() => {
        if (messageHistoryRoomId !== room.id) return;
        if (messageHistory.length === 0) return;

        const additions: TimelineItem[] = [];
        for (const historyMessage of messageHistory) {
            const dedupeKey = getTimelineDedupKey(historyMessage);
            if (dedupeKey && seenMessageKeys.current.has(dedupeKey)) {
                continue;
            }

            const item = toTimelineItem(historyMessage);
            if (!item) continue;

            if (dedupeKey) {
                seenMessageKeys.current.add(dedupeKey);
            }
            additions.push(item);
        }

        if (additions.length > 0) {
            setTimeline((previous) => [...previous, ...additions]);
        }
    }, [messageHistory, messageHistoryRoomId, room.id]);

    useEffect(() => {
        if (!incomingMessage) return;

        const dedupeKey = getTimelineDedupKey(incomingMessage);
        if (dedupeKey && seenMessageKeys.current.has(dedupeKey)) {
            return;
        }

        const item = toTimelineItem(incomingMessage);
        if (item) {
            if (dedupeKey) {
                seenMessageKeys.current.add(dedupeKey);
            }
            setTimeline((previous) => [...previous, item]);
            if (incomingMessage.type === 'chat.message' && incomingMessage.payload.username !== username) {
                playChatTone('receive');
            }
            return;
        }

        if (incomingMessage.type === 'room.state') {
            const currentIds = incomingMessage.payload.participants.map((participant) => participant.id);
            const currentNames = new Map(incomingMessage.payload.participants.map((participant) => [participant.id, participant.username]));

            incomingMessage.payload.participants.forEach((participant) => {
                if (!prevParticipants.current.includes(participant.id)) {
                    setTimeline((previous) => [
                        ...previous,
                        {
                            type: 'event',
                            data: { text: 'joined the party', user: participant.username, icon: 'info' },
                            timestamp: Date.now()
                        }
                    ]);
                }
            });

            prevParticipants.current.forEach((id) => {
                if (!currentIds.includes(id)) {
                    const previousName = participantNamesById.current.get(id) || 'Someone';
                    setTimeline((previous) => [
                        ...previous,
                        {
                            type: 'event',
                            data: { text: 'left the party', user: previousName, icon: 'info' },
                            timestamp: Date.now()
                        }
                    ]);
                }
            });

            if (prevHostId.current !== incomingMessage.payload.hostId) {
                const newHost = incomingMessage.payload.participants.find((participant) => participant.id === incomingMessage.payload.hostId);
                if (newHost) {
                    setTimeline((previous) => [
                        ...previous,
                        {
                            type: 'event',
                            data: {
                                text: newHost.username === username ? 'you are now the host' : 'is now the host',
                                user: newHost.username,
                                icon: 'sync'
                            },
                            timestamp: Date.now()
                        }
                    ]);
                }
                prevHostId.current = incomingMessage.payload.hostId;
            }

            prevParticipants.current = currentIds;
            participantNamesById.current = currentNames;
            return;
        }

        if (incomingMessage.type === 'sync.play_intent') {
            const user = incomingMessage.payload.username || 'Someone';
            setTimeline((previous) => [
                ...previous,
                { type: 'event', data: { text: 'started playing', user, icon: 'play' }, timestamp: Date.now() }
            ]);
            return;
        }

        if (incomingMessage.type === 'sync.pause_intent') {
            const user = incomingMessage.payload.username || 'Someone';
            setTimeline((previous) => [
                ...previous,
                { type: 'event', data: { text: 'paused video', user, icon: 'pause' }, timestamp: Date.now() }
            ]);
            return;
        }

        if (incomingMessage.type === 'sync.set_reference_time') {
            if (incomingMessage.payload.source === 'tick') return;
            const user = incomingMessage.payload.username || 'Someone';
            setTimeline((previous) => [
                ...previous,
                { type: 'event', data: { text: 'jumped time', user, icon: 'seek' }, timestamp: Date.now() }
            ]);
            return;
        }
    }, [incomingMessage, soundsEnabled, username]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [timeline]);

    const dispatchMessage = (nextText: string, nextGifUrl: string | null): boolean => {
        const trimmedText = nextText.trim();
        const composedMessage = nextGifUrl
            ? (trimmedText ? `${trimmedText} ${nextGifUrl}` : nextGifUrl)
            : trimmedText;
        if (!composedMessage) return false;

        playChatTone('send');
        onSendChat(composedMessage);
        setText('');
        setPendingGifUrl(null);
        setShowEmojiPicker(false);
        setShowGifPicker(false);
        setGifQuery('');
        setGifError('');
        setGifResults([]);
        return true;
    };

    const send = (e: React.FormEvent) => {
        e.preventDefault();
        dispatchMessage(text, pendingGifUrl);
    };

    const appendEmoji = (emoji: string) => {
        setText((previous) => `${previous}${emoji}`);
    };

    const addGif = async (rawInput: string) => {
        const trimmed = rawInput.trim();
        if (!trimmed) return;

        setGifError('');
        setGifLoading(true);

        if (/^https?:\/\//i.test(trimmed)) {
            setPendingGifUrl(trimmed);
            setGifResults([]);
            setGifLoading(false);
            return;
        }

        const gifUrls = await fetchGiphyGifs(trimmed, 10);
        setGifLoading(false);
        if (gifUrls.length === 0) {
            setGifResults([]);
            setGifError('No GIF found. Try another keyword.');
            return;
        }
        setGifResults(gifUrls);
        setPendingGifUrl(gifUrls[0]);
    };

    const handleBrokenGifUrl = (brokenUrl: string) => {
        setGifResults((previous) => {
            const next = previous.filter((url) => url !== brokenUrl);
            setPendingGifUrl((current) => (current === brokenUrl ? (next[0] || null) : current));
            return next;
        });
        setGifError((previous) => previous || 'Some GIFs are unavailable. Showing valid ones.');
    };

    const closeGifPicker = (clearSelection = false) => {
        setShowGifPicker(false);
        setGifError('');
        if (clearSelection) {
            setPendingGifUrl(null);
            setGifResults([]);
            setGifQuery('');
        }
    };

    return (
        <div className={`flex h-full min-h-0 flex-col ${isLightMode ? 'bg-[#F4F7FC]' : 'bg-black'}`}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 px-4 pb-4 pt-6 scroll-smooth">
                {timeline.map((item, i) => {
                    const isViewerSyncEvent =
                        item.type === 'event' &&
                        typeof item.data.kind === 'string' &&
                        item.data.kind.startsWith('viewer.');
                    const isAlwaysVisibleViewerEvent =
                        item.type === 'event' &&
                        item.data.kind === 'viewer.request_sync';

                    if (isViewerSyncEvent && !isAlwaysVisibleViewerEvent && !showViewerSyncEvents) {
                        return null;
                    }

                    const messageText = item.type === 'message' ? String(item.data.text || '') : '';
                    const gifUrl = item.type === 'message' ? getGifUrlFromText(messageText) : null;
                    const cleanText = stripUrlFromText(messageText, gifUrl);
                    const timelineGifKey = gifUrl ? `${i}:${gifUrl}` : null;
                    const isTimelineGifBroken = timelineGifKey ? brokenTimelineGifs.has(timelineGifKey) : false;

                    return (
                        <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1 duration-300">
                            <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 shadow-lg ${item.type === 'event' ? (isLightMode ? 'bg-slate-200 text-slate-500' : 'bg-gray-800 text-gray-500') : ''}`}
                                style={item.type === 'message' ? { backgroundColor: item.data.avatarColor } : {}}
                            >
                                {item.type === 'message' ? (
                                    item.data.username[0].toUpperCase()
                                ) : (
                                    item.data.icon === 'play' ? <Play size={10} fill="currentColor" /> :
                                        item.data.icon === 'pause' ? <Pause size={10} fill="currentColor" /> :
                                            item.data.icon === 'seek' ? <FastForward size={10} /> :
                                                item.data.icon === 'warning' ? <AlertTriangle size={10} /> :
                                                    item.data.icon === 'sync' ? <RefreshCw size={10} /> :
                                                        <Info size={10} />
                                )}
                            </div>

                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className={`text-[11px] font-bold ${item.type === 'event' ? (isLightMode ? 'text-slate-500' : 'text-gray-500') : (isLightMode ? 'text-slate-800' : 'text-gray-200')}`}>
                                        {item.type === 'event' ? (item.data.user === 'System' ? 'HOST' : item.data.user) : item.data.username}
                                    </span>
                                    <span className={`text-[9px] font-medium ${isLightMode ? 'text-slate-400' : 'text-gray-700'}`}>
                                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {item.type === 'message' ? (
                                    <>
                                        {(cleanText || (gifUrl && isTimelineGifBroken)) && (
                                            <p className={`text-[12px] leading-relaxed break-words ${isLightMode ? 'text-slate-700' : 'text-gray-300'}`}>
                                                {cleanText || gifUrl}
                                            </p>
                                        )}
                                        {gifUrl && !isTimelineGifBroken && (
                                            <img
                                                src={gifUrl}
                                                alt="GIF"
                                                className="mt-1 rounded-lg border border-white/10 max-h-44 object-contain"
                                                onError={() => {
                                                    if (!timelineGifKey) return;
                                                    setBrokenTimelineGifs((previous) => {
                                                        const next = new Set(previous);
                                                        next.add(timelineGifKey);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <p className={`text-[12px] leading-relaxed break-words italic ${isLightMode ? 'text-slate-500' : 'text-gray-600'}`}>
                                        {item.data.text}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <form onSubmit={send} className={`border-t p-4 ${isLightMode ? 'border-slate-200 bg-white/95' : 'border-white/5 bg-[#0A0A0A]'}`}>
                {showEmojiPicker && (
                    <div className={`mb-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-xl border p-2 ${isLightMode ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#111]'}`}>
                        {EMOJI_OPTIONS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => appendEmoji(emoji)}
                                className={`h-8 w-8 rounded-md text-lg leading-none ${isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                {showGifPicker && (
                    <div className={`mb-2 overflow-hidden rounded-xl border ${isLightMode ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#111]'}`}>
                        <div
                            className={`z-10 flex items-center justify-between border-b px-3 py-2 ${
                                isLightMode ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#111]'
                            }`}
                        >
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>
                                GIF Picker
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        dispatchMessage(text, pendingGifUrl);
                                    }}
                                    disabled={!pendingGifUrl}
                                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-35 ${
                                        isLightMode
                                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                            : 'bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
                                    }`}
                                >
                                    <Send size={10} />
                                    Send GIF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => closeGifPicker(true)}
                                    className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                                        isLightMode
                                            ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                            : 'text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                        <div className="max-h-[28vh] overflow-y-auto p-2 sm:max-h-[32vh]">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={gifQuery}
                                    onChange={(e) => setGifQuery(e.target.value)}
                                    placeholder="Search GIF (e.g. happy dance)"
                                    className={`flex-1 rounded-md border px-2 py-1 text-[11px] outline-none focus:border-blue-500/40 ${isLightMode ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-white/10 bg-black/40 text-gray-200'}`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void addGif(gifQuery);
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        void addGif(gifQuery);
                                    }}
                                    disabled={gifLoading || !gifQuery.trim()}
                                    className="rounded-md bg-pink-600/20 px-2 py-1 text-[10px] font-bold text-pink-200 disabled:opacity-40"
                                >
                                    {gifLoading ? '...' : 'Find'}
                                </button>
                            </div>
                            {gifError && <p className="mt-1 text-[10px] text-red-400">{gifError}</p>}
                            {gifResults.length > 0 && (
                                <div className="mt-2 grid grid-cols-2 gap-1.5 pr-0.5">
                                    {gifResults.map((gifUrl) => (
                                        <button
                                            key={gifUrl}
                                            type="button"
                                            onClick={() => setPendingGifUrl(gifUrl)}
                                            className={`overflow-hidden rounded-md border bg-black/30 transition-colors ${pendingGifUrl === gifUrl ? 'border-blue-400/80' : 'border-white/10 hover:border-white/30'}`}
                                            title="Select GIF"
                                        >
                                            <img
                                                src={gifUrl}
                                                alt="GIF option"
                                                className="h-20 w-full object-contain sm:h-24"
                                                onError={() => handleBrokenGifUrl(gifUrl)}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all focus-within:border-blue-500/30 ${isLightMode ? 'border-slate-200 bg-white' : 'border-white/5 bg-[#161616]'}`}>
                    <button
                        type="button"
                        onClick={() => {
                            setShowEmojiPicker((previous) => !previous);
                            setShowGifPicker(false);
                        }}
                        className={`transition-colors ${isLightMode ? 'text-slate-500 hover:text-amber-500' : 'text-gray-500 hover:text-yellow-300'}`}
                        title="Emoji"
                    >
                        <Smile size={17} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (showGifPicker) {
                                closeGifPicker(false);
                            } else {
                                setShowGifPicker(true);
                            }
                            setShowEmojiPicker(false);
                            setGifError('');
                        }}
                        className={`transition-colors ${isLightMode ? 'text-slate-500 hover:text-pink-500' : 'text-gray-500 hover:text-pink-300'}`}
                        title="Add GIF from Giphy"
                    >
                        <ImageIcon size={17} />
                    </button>
                    <input
                        type="text"
                        placeholder={pendingGifUrl ? 'Add a caption (optional)...' : 'Say something... (supports emoji and GIF)'}
                        className={`flex-1 border-none bg-transparent py-1 text-[13px] outline-none ${isLightMode ? 'text-slate-700 placeholder:text-slate-400' : 'text-gray-300 placeholder:text-gray-700'}`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <button type="submit" disabled={!text.trim() && !pendingGifUrl} className="text-blue-500 transition-opacity disabled:opacity-20">
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
}
