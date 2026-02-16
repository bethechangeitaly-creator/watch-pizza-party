import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, User as UserIcon, Copy, Check, X } from 'lucide-react';
import { CreditsModal } from './CreditsModal';

// Locally defined to avoid monorepo build sync issues
const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Black', 'White', 'Brown', 'Gray', 'Teal'];
const PIZZA_INGREDIENTS = [
    'Pepperoni', 'Mushroom', 'Olive', 'Onion', 'Basil', 'Sausage',
    'Mozzarella', 'Tomato', 'Ham', 'Bacon', 'Jalapeno', 'Pineapple',
    'Anchovy', 'Garlic', 'Capers', 'Truffle', 'Pesto', 'HotHoney',
    'Burrata', 'ChiliFlake'
];
function getLocalRandomName() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const ingredient = PIZZA_INGREDIENTS[Math.floor(Math.random() * PIZZA_INGREDIENTS.length)];
    return `${color}_${ingredient}`;
}

interface LandingProps {
    onJoin: (roomId: string, username: string) => void;
    externalError?: string | null;
    serverUrl: string;
    serverUrlSaving: boolean;
    onSaveServerUrl: (url: string) => Promise<void>;
}

type RuntimeResponse<T = unknown> = {
    ok: boolean;
    reason?: string;
} & T;

type InitialMediaState = {
    url: string;
    title?: string;
    platform: 'youtube' | 'netflix' | 'unknown';
    timeSeconds: number;
    isPlaying: boolean;
};

type LocalStateResponse = {
    type: 'LOCAL_STATE';
    url: string;
    title?: string;
    platform?: 'youtube' | 'netflix' | 'unknown';
    time: number;
    isPlaying: boolean;
};

function sendRuntimeMessage<T = unknown>(message: Record<string, unknown>): Promise<RuntimeResponse<T> | null> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            resolve((response || null) as RuntimeResponse<T> | null);
        });
    });
}

function parseRoomInput(rawInput: string): string {
    const value = rawInput.trim();
    if (!value) return '';
    if (!value.includes('://')) return value;

    try {
        const parsed = new URL(value);
        const queryRoomId = parsed.searchParams.get('roomId') || parsed.searchParams.get('room');
        if (queryRoomId) return queryRoomId;

        const pathParts = parsed.pathname.split('/').filter(Boolean);
        return pathParts[pathParts.length - 1] || '';
    } catch {
        return value;
    }
}

function normalizeWatchUrl(rawUrl?: string): string {
    if (!rawUrl) return '';

    try {
        const parsed = new URL(rawUrl);
        parsed.hash = '';

        if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
            const videoId = parsed.searchParams.get('v');
            if (videoId) {
                return `${parsed.origin}${parsed.pathname}?v=${videoId}`;
            }
        }

        if (parsed.hostname === 'youtu.be') {
            return `${parsed.origin}${parsed.pathname}`;
        }

        if (parsed.hostname.includes('netflix.com')) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const watchIndex = parts.indexOf('watch');
            if (watchIndex !== -1 && parts[watchIndex + 1]) {
                return `${parsed.origin}/watch/${parts[watchIndex + 1]}`;
            }
        }

        return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
        return rawUrl;
    }
}

function detectPlatform(rawUrl?: string): 'youtube' | 'netflix' | 'unknown' {
    if (!rawUrl) return 'unknown';
    try {
        const parsed = new URL(rawUrl);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname.includes('youtube.com') || hostname === 'youtu.be') return 'youtube';
        if (hostname.includes('netflix.com')) return 'netflix';
    } catch {
        return 'unknown';
    }
    return 'unknown';
}

function requestTabMediaState(tabId: number): Promise<LocalStateResponse | null> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_MEDIA_STATE' }, (response: LocalStateResponse | undefined) => {
            if (chrome.runtime.lastError || !response || response.type !== 'LOCAL_STATE') {
                resolve(null);
                return;
            }
            resolve(response);
        });
    });
}

function injectContentScriptIntoTab(tabId: number): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                files: ['content.js']
            },
            () => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }
                resolve(true);
            }
        );
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function getTabMediaState(tabId: number): Promise<LocalStateResponse | null> {
    const firstTry = await requestTabMediaState(tabId);
    if (firstTry) return firstTry;

    const injected = await injectContentScriptIntoTab(tabId);
    if (!injected) return null;

    await sleep(120);
    return requestTabMediaState(tabId);
}

function getInitialMediaState(): Promise<InitialMediaState | undefined> {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            const activeTabId = activeTab?.id;
            if (!activeTabId) {
                resolve(undefined);
                return;
            }

            const fallbackUrl = normalizeWatchUrl(activeTab.url);
            const fallbackState = fallbackUrl
                ? {
                    url: fallbackUrl,
                    title: activeTab.title || undefined,
                    platform: detectPlatform(fallbackUrl),
                    timeSeconds: 0,
                    isPlaying: false
                }
                : undefined;

            void getTabMediaState(activeTabId).then((response) => {
                if (!response) {
                    resolve(fallbackState);
                    return;
                }

                const normalizedUrl = normalizeWatchUrl(response.url);
                if (!normalizedUrl) {
                    resolve(fallbackState);
                    return;
                }

                resolve({
                    url: normalizedUrl,
                    title: response.title,
                    platform: response.platform || detectPlatform(normalizedUrl),
                    timeSeconds: Math.max(0, Number(response.time) || 0),
                    isPlaying: Boolean(response.isPlaying)
                });
            });
        });
    });
}

function normalizeServerBaseUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error('Server URL is required');
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('Invalid server URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Server URL must start with http:// or https://');
    }

    const normalizedPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${normalizedPath}`;
}

function isLocalOnlyServerUrl(raw: string): boolean {
    const value = raw.trim();
    if (!value) return true;

    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
    } catch {
        return true;
    }
}

const LAST_ROOM_CODE_STORAGE_KEY = 'watchparty_last_room_code';

export function Landing({ onJoin, externalError, serverUrl, serverUrlSaving, onSaveServerUrl }: LandingProps) {
    const [mode, setMode] = useState<'join' | 'create'>('create');
    const [username, setUsername] = useState('');
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(externalError || '');
    const [serverMode, setServerMode] = useState<'pizza' | 'local'>('pizza');
    const [customServerUrl, setCustomServerUrl] = useState('http://127.0.0.1:3005');
    const [serverUrlMessage, setServerUrlMessage] = useState('');
    const [showCredits, setShowCredits] = useState(false);
    const [creditsInitialTab, setCreditsInitialTab] = useState<'about' | 'guide'>('about');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [pizzaServerStatus, setPizzaServerStatus] = useState<'checking' | 'online' | 'starting' | 'offline'>('checking');

    const PIZZA_SERVER_URL = 'https://watch-pizza-party.onrender.com';
    const activeServerUrl = serverMode === 'pizza' ? PIZZA_SERVER_URL : customServerUrl.trim();

    useEffect(() => {
        setUsername(getLocalRandomName());
    }, []);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(LAST_ROOM_CODE_STORAGE_KEY);
            if (stored && stored.trim()) {
                setRoomId(stored);
            }
        } catch {
            // Ignore storage failures.
        }
    }, []);

    useEffect(() => {
        // Initialize from stored serverUrl
        if (serverUrl === PIZZA_SERVER_URL) {
            setServerMode('pizza');
        } else {
            setServerMode('local');
            setCustomServerUrl(serverUrl || 'http://127.0.0.1:3005');
        }
    }, [serverUrl]);

    useEffect(() => {
        if (externalError) setError(externalError);
    }, [externalError]);

    // Check Pizza Server status on mount and when switching to pizza mode
    useEffect(() => {
        if (serverMode !== 'pizza') return;

        let cancelled = false;
        setPizzaServerStatus('checking');

        const checkPizzaServer = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                const response = await fetch(`${PIZZA_SERVER_URL}/`, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (cancelled) return;

                if (response.ok) {
                    setPizzaServerStatus('online');
                } else {
                    setPizzaServerStatus('offline');
                }
            } catch (error: any) {
                if (cancelled) return;

                // If timeout/abort, server is likely cold-starting
                if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                    setPizzaServerStatus('starting');
                } else {
                    setPizzaServerStatus('offline');
                }
            }
        };

        void checkPizzaServer();

        return () => {
            cancelled = true;
        };
    }, [serverMode]);

    const handleCopy = async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            window.setTimeout(() => {
                setCopiedKey((previous) => (previous === key ? null : previous));
            }, 1400);
        } catch {
            setServerUrlMessage('Could not copy. Copy manually.');
        }
    };

    const handleRoomIdChange = (value: string) => {
        setRoomId(value);
        try {
            window.localStorage.setItem(LAST_ROOM_CODE_STORAGE_KEY, value);
        } catch {
            // Ignore storage failures.
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUsername = username.trim();
        const parsedRoomId = parseRoomInput(roomId);

        if (mode === 'join' && !parsedRoomId) {
            setError('Please enter a Room ID');
            return;
        }

        setError('');

        if (mode === 'create') {
            setLoading(true);
            try {
                const initialMedia = await getInitialMediaState();

                const createPayload = {
                    hostUsername: trimmedUsername || undefined,
                    initialMedia
                };
                const runtimeCreate = await sendRuntimeMessage<{ roomId?: string; username?: string }>({
                    type: 'WATCHPARTY_CREATE_ROOM',
                    hostUsername: createPayload.hostUsername,
                    initialMedia: createPayload.initialMedia
                });

                if (runtimeCreate?.ok && runtimeCreate.roomId && runtimeCreate.username) {
                    onJoin(runtimeCreate.roomId, runtimeCreate.username);
                    return;
                }

                if (runtimeCreate && !runtimeCreate.ok) {
                    throw new Error(runtimeCreate.reason || 'Failed to create room');
                }

                // Fallback path if runtime bridge is not available.
                const normalizedServerUrl = normalizeServerBaseUrl(serverUrl);
                const createUrls = [`${normalizedServerUrl}/rooms`, 'http://127.0.0.1:3005/rooms', 'http://localhost:3005/rooms']
                    .filter((url, index, source) => source.indexOf(url) === index);
                let lastCreateError: Error | null = null;
                let data: { roomId: string; username: string } | null = null;

                for (const url of createUrls) {
                    try {
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(createPayload)
                        });

                        if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error((body as { error?: string }).error || `Server Error (${res.status})`);
                        }

                        data = await res.json();
                        break;
                    } catch (err) {
                        lastCreateError = err as Error;
                    }
                }

                if (!data) {
                    throw lastCreateError || new Error('Failed to create room');
                }

                onJoin(data.roomId, data.username);
            } catch (err: any) {
                console.error('[WatchParty] Room creation failed:', err);
                setError(err.message === 'Failed to fetch'
                    ? 'Cannot connect to server. Ensure it is running (npm run dev:server)'
                    : err.message);
            } finally {
                setLoading(false);
            }
        } else {
            try {
                window.localStorage.setItem(LAST_ROOM_CODE_STORAGE_KEY, parsedRoomId);
            } catch {
                // Ignore storage failures.
            }
            onJoin(parsedRoomId, trimmedUsername);
        }
    };

    return (
        <div className="h-screen bg-[#050505] text-white">
            <div className="mx-auto flex h-full max-w-md flex-col overflow-y-auto px-4 pb-4 pt-3">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setCreditsInitialTab('about');
                                setShowCredits(true);
                            }}
                            className="watchparty-logo-pulse flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-600 shadow-xl shadow-blue-500/20 transition-transform hover:scale-[1.03]"
                            title="About Watch Pizza Party"
                        >
                            <img src="/icon128.png" alt="Watch Pizza Party" className="h-full w-full object-cover" />
                        </button>
                        <div className="min-w-0">
                            <p className="text-[25px] font-black leading-[1.02] tracking-tight text-white">Watch Pizza Party</p>
                            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-gray-600">Next Gen Sidebar Sync</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setCreditsInitialTab('guide');
                            setShowCredits(true);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 transition-colors hover:bg-blue-500/20"
                        title="View Guide"
                    >
                        Guide
                    </button>
                </div>

                <div className="mb-4 flex rounded-2xl border border-white/5 bg-[#111] p-1 shadow-inner">
                    <button
                        onClick={() => setMode('create')}
                        className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all duration-300 ${mode === 'create' ? 'bg-blue-600 text-white shadow-xl' : 'text-gray-600 hover:text-gray-400'}`}
                    >
                        Host Party
                    </button>
                    <button
                        onClick={() => setMode('join')}
                        className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all duration-300 ${mode === 'join' ? 'bg-blue-600 text-white shadow-xl' : 'text-gray-600 hover:text-gray-400'}`}
                    >
                        Join Party
                    </button>
                </div>

                <div className="mb-4 rounded-2xl border border-white/10 bg-[#0D0D0D] p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Server</label>
                    </div>

                    <div className="mb-2 flex gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setServerMode('pizza');
                                setServerUrlMessage('');
                                try {
                                    await onSaveServerUrl(PIZZA_SERVER_URL);
                                } catch {
                                    // Silent save
                                }
                            }}
                            title="Free online server - works anywhere! Friends can join from different locations."
                            className={`flex-[3] rounded-xl py-3 text-sm font-black transition-all ${
                                serverMode === 'pizza'
                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-2xl shadow-orange-500/50 scale-105'
                                    : 'bg-orange-900/20 text-orange-300 hover:bg-orange-900/30 border border-orange-500/30'
                            }`}
                        >
                            🍕 Pizza Server
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setServerMode('local');
                                setServerUrlMessage('');
                            }}
                            title="For developers running their own server locally. Others cannot connect remotely."
                            className={`flex-1 rounded-lg py-2 text-[9px] font-bold transition-all ${
                                serverMode === 'local'
                                    ? 'bg-gray-600 text-white shadow-lg'
                                    : 'bg-gray-900/40 text-gray-600 hover:text-gray-400 border border-gray-700/50'
                            }`}
                        >
                            🏠 Local
                        </button>
                    </div>

                    {serverMode === 'pizza' && (
                        <div className="mb-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Status:</span>
                                {pizzaServerStatus === 'checking' && (
                                    <>
                                        <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                                        <span className="text-[9px] font-semibold text-gray-400">Checking...</span>
                                    </>
                                )}
                                {pizzaServerStatus === 'online' && (
                                    <>
                                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                                        <span className="text-[9px] font-semibold text-emerald-300">Online & Ready</span>
                                    </>
                                )}
                                {pizzaServerStatus === 'starting' && (
                                    <>
                                        <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                                        <span className="text-[9px] font-semibold text-yellow-300">Starting (~30s)</span>
                                    </>
                                )}
                                {pizzaServerStatus === 'offline' && (
                                    <>
                                        <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]" />
                                        <span className="text-[9px] font-semibold text-red-300">Offline</span>
                                    </>
                                )}
                            </div>

                            {pizzaServerStatus === 'starting' && (
                                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                                    <p className="text-[10px] font-semibold text-yellow-300 mb-1">⏳ Server is waking up...</p>
                                    <p className="text-[9px] text-yellow-200/70 leading-relaxed">
                                        The Pizza Server starts on-demand. Wait ~30 seconds, then try creating your room. It will work on the next attempt!
                                    </p>
                                </div>
                            )}

                            {pizzaServerStatus === 'offline' && (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                                    <p className="text-[10px] font-semibold text-red-300 mb-1">🔴 Server appears offline</p>
                                    <p className="text-[9px] text-red-200/70 leading-relaxed">
                                        Don't worry! Try clicking "Create a Pizza Party" anyway - the server often starts on the first request. If it fails, wait 30 seconds and try again.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {serverMode === 'local' && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <input
                                type="text"
                                value={customServerUrl}
                                onChange={(e) => setCustomServerUrl(e.target.value)}
                                placeholder="http://127.0.0.1:3005"
                                className="w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-[11px] text-gray-200 outline-none transition-all placeholder:text-gray-700 focus:ring-2 focus:ring-blue-500/40"
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    setServerUrlMessage('');
                                    try {
                                        const urlToSave = normalizeServerBaseUrl(customServerUrl);
                                        await onSaveServerUrl(urlToSave);
                                    } catch {
                                        setServerUrlMessage('Failed to save');
                                    }
                                }}
                                disabled={serverUrlSaving}
                                className="w-full rounded-lg bg-blue-600/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-200 transition-colors hover:bg-blue-600/35 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {serverUrlSaving ? 'Saving...' : 'Save Local Server'}
                            </button>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Your Alias</label>
                            <button
                                type="button"
                                onClick={() => setUsername(getLocalRandomName())}
                                className="text-[9px] font-bold text-blue-500 hover:underline"
                            >
                                SHUFFLE
                            </button>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center text-gray-700">
                                <UserIcon size={16} />
                            </div>
                            <input
                                type="text"
                                placeholder="e.g. Red_Pepperoni"
                                className="w-full rounded-2xl border border-white/10 bg-[#111] py-3 pl-12 pr-5 text-sm outline-none transition-all placeholder:text-gray-800 focus:ring-2 focus:ring-blue-500/50"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>

                    {mode === 'join' && (
                        <div className="space-y-1 animate-in zoom-in-95 duration-300">
                            <label className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Room Code</label>
                            <input
                                type="text"
                                placeholder="Paste ID here..."
                                className="w-full rounded-2xl border border-white/10 bg-[#111] px-5 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-800 focus:ring-2 focus:ring-blue-500/50"
                                value={roomId}
                                onChange={(e) => handleRoomIdChange(e.target.value)}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 font-bold text-white shadow-2xl shadow-blue-500/10 transition-all active:scale-95 hover:bg-blue-500"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                {mode === 'create' ? 'Create a Pizza Party' : 'Enter Room'}
                                <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-3 text-[11px] font-bold leading-relaxed text-red-500">
                            ⚠️ {error}
                        </div>
                    )}
                </form>
            </div>

            <CreditsModal open={showCredits} onClose={() => setShowCredits(false)} initialTab={creditsInitialTab} />
        </div>
    );
}
