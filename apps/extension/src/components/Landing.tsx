import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, User as UserIcon, HelpCircle, Copy, Check, X } from 'lucide-react';
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

const START_SERVER_COMMAND = 'npm run dev:server';
const INSTALL_NGROK_MAC_COMMAND = 'brew install ngrok/ngrok/ngrok';
const INSTALL_NGROK_WINDOWS_WINGET_COMMAND = 'winget install --id Ngrok.Ngrok -e';
const INSTALL_NGROK_WINDOWS_CHOCO_COMMAND = 'choco install ngrok -y';
const NGROK_AUTHTOKEN_COMMAND = 'ngrok config add-authtoken YOUR_TOKEN_HERE';
const START_NGROK_COMMAND = 'ngrok http 3005';
const LAST_ROOM_CODE_STORAGE_KEY = 'watchparty_last_room_code';

type GuideOs = 'windows' | 'mac' | 'other';

function detectGuideOs(): GuideOs {
    try {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('windows')) return 'windows';
        if (ua.includes('mac os')) return 'mac';
    } catch {
        // Ignore detection failures.
    }
    return 'other';
}

export function Landing({ onJoin, externalError, serverUrl, serverUrlSaving, onSaveServerUrl }: LandingProps) {
    const [mode, setMode] = useState<'join' | 'create'>('create');
    const [username, setUsername] = useState('');
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(externalError || '');
    const [serverUrlDraft, setServerUrlDraft] = useState(serverUrl);
    const [serverUrlMessage, setServerUrlMessage] = useState('');
    const [showGuide, setShowGuide] = useState(false);
    const [showCredits, setShowCredits] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const activeServerUrl = (serverUrlDraft || serverUrl || '').trim();
    const isLocalServerUrl = isLocalOnlyServerUrl(activeServerUrl);
    const publicServerUrl = isLocalServerUrl ? '' : activeServerUrl;
    const guideOs = detectGuideOs();
    const guideOsLabel = guideOs === 'windows' ? 'Windows' : guideOs === 'mac' ? 'macOS' : 'Other';
    const ngrokInstallRows = guideOs === 'windows'
        ? [
            {
                key: 'install-ngrok-win-winget',
                label: 'Windows (recommended)',
                command: INSTALL_NGROK_WINDOWS_WINGET_COMMAND
            },
            {
                key: 'install-ngrok-mac',
                label: 'macOS',
                command: INSTALL_NGROK_MAC_COMMAND
            },
            {
                key: 'install-ngrok-win-choco',
                label: 'Windows (Chocolatey fallback)',
                command: INSTALL_NGROK_WINDOWS_CHOCO_COMMAND
            }
        ]
        : [
            {
                key: 'install-ngrok-mac',
                label: 'macOS (recommended)',
                command: INSTALL_NGROK_MAC_COMMAND
            },
            {
                key: 'install-ngrok-win-winget',
                label: 'Windows',
                command: INSTALL_NGROK_WINDOWS_WINGET_COMMAND
            },
            {
                key: 'install-ngrok-win-choco',
                label: 'Windows (Chocolatey fallback)',
                command: INSTALL_NGROK_WINDOWS_CHOCO_COMMAND
            }
        ];

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
        setServerUrlDraft(serverUrl);
    }, [serverUrl]);

    useEffect(() => {
        if (externalError) setError(externalError);
    }, [externalError]);

    const handleSaveServerUrl = async () => {
        setServerUrlMessage('');
        try {
            const normalizedServerUrl = normalizeServerBaseUrl(serverUrlDraft);
            await onSaveServerUrl(normalizedServerUrl);
            setServerUrlDraft(normalizedServerUrl);
            setServerUrlMessage('Server URL saved');
            window.setTimeout(() => {
                setServerUrlMessage('');
            }, 2200);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not save server URL';
            setServerUrlMessage(message);
        }
    };

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
                            onClick={() => setShowCredits(true)}
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
                        onClick={() => setShowGuide(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 transition-colors hover:bg-blue-500/20"
                        title="How to use"
                    >
                        <HelpCircle size={12} />
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
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Server URL</label>
                        <button
                            type="button"
                            onClick={handleSaveServerUrl}
                            disabled={serverUrlSaving}
                            className="rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 transition-colors hover:bg-blue-600/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {serverUrlSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                    <input
                        type="text"
                        value={serverUrlDraft}
                        onChange={(e) => setServerUrlDraft(e.target.value)}
                        placeholder="https://...ngrok-free.app"
                        className="w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-[11px] text-gray-200 outline-none transition-all placeholder:text-gray-700 focus:ring-2 focus:ring-blue-500/40"
                    />
                    <p className="mt-1 text-[9px] text-gray-600">For remote use: paste your ngrok URL and click Save.</p>
                    {isLocalServerUrl ? (
                        <p className="mt-1 text-[9px] font-bold text-yellow-400">Local only. Other people cannot connect with this URL.</p>
                    ) : (
                        <p className="mt-1 text-[9px] font-bold text-green-400">Public URL detected. Remote users can join.</p>
                    )}
                    {serverUrlMessage && (
                        <p className={`mt-1 text-[9px] font-bold ${serverUrlMessage === 'Server URL saved' ? 'text-green-400' : 'text-red-400'}`}>
                            {serverUrlMessage}
                        </p>
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
                                {mode === 'create' ? 'Instant Create' : 'Enter Room'}
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

            <CreditsModal open={showCredits} onClose={() => setShowCredits(false)} />

            {showGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5">
                    <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0A0A0A] p-4 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-sm font-black tracking-wide text-white">Quick Setup Guide</h2>
                            <button
                                type="button"
                                onClick={() => setShowGuide(false)}
                                className="rounded-full border border-white/10 p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        </div>

                        <div className="space-y-3 text-[11px] text-gray-300">
                            <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
                                <p className="font-bold text-blue-100">How this guide works</p>
                                <p className="mt-1 text-[10px] text-blue-200/90">
                                    Host flow: start server, expose it with ngrok, create room, then share Server URL + Room Code.
                                </p>
                                <p className="mt-1 text-[10px] text-blue-200/90">
                                    Guest flow: paste the same Server URL, switch to Join Party, paste Room Code, then enter.
                                </p>
                                <p className="mt-1 text-[10px] font-bold text-blue-200/90">
                                    OS detected: {guideOsLabel}. Guide below supports both Windows and macOS.
                                </p>
                            </div>

                            <details className="rounded-xl border border-white/10 bg-[#101010] p-3">
                                <summary className="cursor-pointer list-none text-[11px] font-black tracking-wide text-white">
                                    Are you hosting the party? 🍕
                                </summary>
                                <div className="mt-3 space-y-3">
                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">1) Start the Watch Party server (Terminal/PowerShell #1)</p>
                                        <div className="mt-2 rounded-lg border border-white/10 bg-black px-2 py-1.5 font-mono text-[10px] text-blue-200">
                                            {START_SERVER_COMMAND}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy('start-server', START_SERVER_COMMAND)}
                                            className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-600/35"
                                        >
                                            {copiedKey === 'start-server' ? <Check size={11} /> : <Copy size={11} />}
                                            {copiedKey === 'start-server' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">2) Install ngrok (one-time)</p>
                                        {ngrokInstallRows.map((row) => (
                                            <div key={row.key} className="mt-2 rounded-lg border border-white/10 bg-black/70 px-2 py-2">
                                                <p className="text-[10px] font-bold text-gray-300">{row.label}</p>
                                                <div className="mt-1 rounded-md border border-white/10 bg-black px-2 py-1.5 font-mono text-[10px] text-blue-200">
                                                    {row.command}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopy(row.key, row.command)}
                                                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-600/35"
                                                >
                                                    {copiedKey === row.key ? <Check size={11} /> : <Copy size={11} />}
                                                    {copiedKey === row.key ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                        ))}
                                        <p className="mt-2 text-[10px] text-gray-500">
                                            If install commands fail, download ngrok manually from{' '}
                                            <a
                                                href="https://ngrok.com/download"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-bold text-blue-300 underline-offset-2 hover:underline"
                                            >
                                                ngrok.com/download
                                            </a>
                                            .
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">3) Add ngrok authtoken (one-time)</p>
                                        <div className="mt-2 rounded-lg border border-white/10 bg-black px-2 py-1.5 font-mono text-[10px] text-blue-200">
                                            {NGROK_AUTHTOKEN_COMMAND}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy('ngrok-authtoken', NGROK_AUTHTOKEN_COMMAND)}
                                            className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-600/35"
                                        >
                                            {copiedKey === 'ngrok-authtoken' ? <Check size={11} /> : <Copy size={11} />}
                                            {copiedKey === 'ngrok-authtoken' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">4) Start ngrok tunnel (Terminal/PowerShell #2)</p>
                                        <div className="mt-1 rounded-lg border border-white/10 bg-black px-2 py-1.5 font-mono text-[10px] text-blue-200">
                                            {START_NGROK_COMMAND}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy('start-ngrok', START_NGROK_COMMAND)}
                                            className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-600/35"
                                        >
                                            {copiedKey === 'start-ngrok' ? <Check size={11} /> : <Copy size={11} />}
                                            {copiedKey === 'start-ngrok' ? 'Copied' : 'Copy'}
                                        </button>
                                        <p className="mt-1 text-[10px] text-gray-500">Keep both terminal windows running while the party is active.</p>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">5) Paste ngrok URL in Server URL and click Save</p>
                                        <p className="mt-1 text-[10px] text-gray-500">Example: https://super-fast-miao.ngrok-free.app</p>
                                        {isLocalServerUrl ? (
                                            <div className="mt-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-1.5 text-[10px] font-bold text-yellow-300">
                                                No public URL saved yet. Paste your ngrok URL and click Save.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mt-2 rounded-lg border border-white/10 bg-black px-2 py-1.5 font-mono text-[10px] text-blue-200 break-all">
                                                    {publicServerUrl}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopy('server-url', publicServerUrl)}
                                                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-600/35"
                                                >
                                                    {copiedKey === 'server-url' ? <Check size={11} /> : <Copy size={11} />}
                                                    {copiedKey === 'server-url' ? 'Copied' : 'Copy URL'}
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                                        <p className="font-bold text-white">6) Click Instant Create and share invite info</p>
                                        <p className="mt-1 text-[10px] text-gray-300">Share both values with guests: Server URL and Room Code.</p>
                                    </div>
                                </div>
                            </details>

                            <details className="rounded-xl border border-white/10 bg-[#101010] p-3">
                                <summary className="cursor-pointer list-none text-[11px] font-black tracking-wide text-white">
                                    Are you joining as guest? 👀
                                </summary>
                                <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
                                    <p className="text-[10px] text-gray-300">1) Ask the host for both values: Server URL and Room Code.</p>
                                    <p className="text-[10px] text-gray-300">2) Paste the host Server URL and click Save.</p>
                                    <p className="text-[10px] text-gray-300">3) Switch to Join Party mode.</p>
                                    <p className="text-[10px] text-gray-300">4) Paste Room Code and click Enter Room.</p>
                                    <p className="text-[10px] text-gray-300">5) Open the same movie/video as host and keep this sidebar open.</p>
                                    <p className="mt-1 text-[10px] text-blue-200/90">
                                        Tip: if connection fails, verify the Server URL is exactly the same as host (including https and domain).
                                    </p>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
