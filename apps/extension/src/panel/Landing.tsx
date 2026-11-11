import { useState } from 'react';
import { BookOpen, Shuffle } from 'lucide-react';
import { extractMedia, generateRandomName, isSupportedSite, sanitizeUsername } from '@watch-party/shared';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import type { ActiveTab } from './activeTab';
import { parseRoomCode } from './roomCode';
import { Button } from './ui/Button';
import { TextField } from './ui/TextField';
import type { ServerStatus } from './serverStatus';

const WAKING_TITLE = '⏳ Server is waking up...';
const WAKING_NOTE = 'The Pizza Server starts on-demand. Wait ~30 seconds — your party will start by itself.';
const OFFLINE_TITLE = '🔴 Server appears offline';
const OFFLINE_NOTE = "Don't worry! Try clicking \"Create a Pizza Party\" anyway - the server often starts on the first request. If it fails, wait 30 seconds and try again.";

const STATUS: Record<ServerStatus, { label: string; dot: string }> = {
    checking: { label: 'Checking...', dot: 'bg-muted' },
    online: { label: 'Online & Ready', dot: 'bg-ok-fg' },
    waking: { label: 'Starting (~30s)', dot: 'bg-warn-fg' },
    offline: { label: 'Offline', dot: 'bg-bad-fg' },
};

export function Landing({
    session,
    send,
    activeTab,
    onAbout,
    serverStatus,
    onRetryServer,
}: {
    session: PublicSession | null;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    activeTab: ActiveTab | null;
    onAbout: () => void;
    serverStatus: ServerStatus;
    onRetryServer: () => void;
}) {
    const [mode, setMode] = useState<'host' | 'join'>('host');
    const [name, setName] = useState(() => generateRandomName().name);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const [lastAction, setLastAction] = useState<'create' | 'join' | null>(null);
    const [serverDraft, setServerDraft] = useState(session?.serverUrl ?? '');
    const [serverMessage, setServerMessage] = useState<string | null>(null);

    const status = session?.status ?? 'idle';
    const busy = status === 'connecting' || status === 'waking';
    const media = activeTab?.url ? extractMedia(activeTab.url) : null;
    const username = sanitizeUsername(name) ?? generateRandomName().name;
    const sessionError = status === 'error' ? session?.error?.message ?? null : null;

    const start = () => {
        if (!activeTab) return;
        setLastAction('create');
        void send({ type: 'session.create', username, tabId: activeTab.tabId });
    };

    const join = () => {
        const roomId = parseRoomCode(code);
        if (!roomId) {
            setCodeError("That doesn't look like a room code.");
            return;
        }
        if (!activeTab) {
            setCodeError('Open the tab you want to watch in, then try again.');
            return;
        }
        setCodeError(null);
        setLastAction('join');
        void send({ type: 'session.join', roomId, username, tabId: activeTab.tabId });
    };

    const saveServer = async (url: string) => {
        const response = await send({ type: 'server.setUrl', url });
        if (response.ok) {
            setServerDraft(response.state.serverUrl);
            setServerMessage('Saved.');
        } else {
            setServerMessage(response.error);
        }
    };

    const waking = status === 'waking' || serverStatus === 'waking';
    const tabClass = (id: 'host' | 'join') =>
        `flex h-10 flex-1 items-center justify-center rounded-control text-body font-bold transition-colors ${
            mode === id ? 'bg-accent-strong text-accent-fg' : 'text-muted hover:text-text'
        }`;

    return (
        <main className="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-4 text-text">
            <header className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-cheese">
                    <img src="/icon128.png" alt="" className="h-10 w-10" />
                </span>
                <div className="min-w-0 flex-1">
                    <h1 className="text-display font-bold leading-tight">Watch Pizza Party</h1>
                    <p className="text-meta font-semibold text-muted">Sync &amp; Watch Together</p>
                </div>
                <button
                    type="button"
                    onClick={onAbout}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-control bg-invite px-2.5 text-meta font-bold text-invite-fg"
                >
                    <BookOpen size={13} /> View Guide
                </button>
            </header>

            <section className="flex flex-col gap-2 rounded-card bg-surface p-3 shadow-[0_1px_3px_rgb(120_60_20/0.08)] dark:shadow-none">
                <div className="flex items-center gap-2 text-meta">
                    <span className="font-bold text-muted">Status:</span>
                    <span className={`h-2 w-2 rounded-full ${STATUS[serverStatus].dot}`} aria-hidden="true" />
                    <span className="flex-1 font-bold">{STATUS[serverStatus].label}</span>
                    {serverStatus === 'offline' && (
                        <button type="button" onClick={onRetryServer} className="font-bold text-accent-strong underline dark:text-accent">Retry</button>
                    )}
                </div>
                {waking && (
                    <div className="rounded-control bg-warn px-3 py-2 text-meta text-warn-fg">
                        <p className="font-bold">{WAKING_TITLE}</p>
                        <p>{WAKING_NOTE}</p>
                    </div>
                )}
                {serverStatus === 'offline' && !waking && (
                    <div className="rounded-control bg-bad px-3 py-2 text-meta text-bad-fg">
                        <p className="font-bold">{OFFLINE_TITLE}</p>
                        <p>{OFFLINE_NOTE}</p>
                    </div>
                )}
            </section>

            <div role="tablist" aria-label="Host or join" className="flex gap-1 rounded-card bg-surface-2 p-1">
                <button type="button" role="tab" aria-selected={mode === 'host'} className={tabClass('host')} onClick={() => setMode('host')}>Host Party</button>
                <button type="button" role="tab" aria-selected={mode === 'join'} className={tabClass('join')} onClick={() => setMode('join')}>Join Party</button>
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="wpp-name" className="text-meta font-bold text-muted">Your Alias</label>
                <div className="flex items-center gap-2">
                    <input
                        id="wpp-name"
                        value={name}
                        maxLength={32}
                        placeholder="e.g. Red Pepperoni"
                        onChange={(e) => setName(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-control bg-surface-2 px-3 text-body font-semibold text-text"
                    />
                    <Button size="sm" className="h-10" onClick={() => setName(generateRandomName().name)}>
                        <Shuffle size={14} /> Shuffle
                    </Button>
                </div>
            </div>

            {mode === 'host' ? (
                <section className="flex flex-col gap-2">
                    <Button variant="primary" className="h-12" onClick={start} disabled={!activeTab || busy} loading={busy && lastAction === 'create'}>
                        🍕 Create a Pizza Party
                    </Button>
                    {media ? (
                        <p className="truncate text-meta text-muted">Using: {activeTab?.title || 'this video'}</p>
                    ) : (
                        <p className="text-meta text-muted">You can open a YouTube or Netflix video after starting.</p>
                    )}
                    {sessionError && lastAction !== 'join' && <p role="alert" className="rounded-control bg-bad px-3 py-2 text-meta text-bad-fg">{sessionError}</p>}
                </section>
            ) : (
                <section className="flex flex-col gap-2">
                    <TextField
                        label="Room Code"
                        mono
                        value={code}
                        placeholder="Paste ID here..."
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => {
                            setCode(e.target.value);
                            setCodeError(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') join();
                        }}
                        error={codeError}
                    />
                    <Button variant="primary" className="h-12" onClick={join} disabled={busy} loading={busy && lastAction === 'join'}>
                        Enter Room
                    </Button>
                    {activeTab && !isSupportedSite(activeTab.url) && !codeError && (
                        <p className="text-meta text-muted">The video will open in a new tab.</p>
                    )}
                    {sessionError && lastAction === 'join' && <p role="alert" className="rounded-control bg-bad px-3 py-2 text-meta text-bad-fg">{sessionError}</p>}
                </section>
            )}

            {busy && lastAction === null && <p className="text-meta text-muted">Rejoining your party…</p>}
            {busy && (
                <button type="button" className="self-start text-meta text-muted underline" onClick={() => void send({ type: 'session.leave' })}>
                    Cancel Connection
                </button>
            )}

            <details className="mt-auto text-meta text-muted">
                <summary className="cursor-pointer select-none">Server</summary>
                <div className="mt-3 flex flex-col gap-2">
                    <TextField
                        label="Server"
                        mono
                        value={serverDraft}
                        onChange={(e) => {
                            setServerDraft(e.target.value);
                            setServerMessage(null);
                        }}
                        hint={serverMessage ?? 'Free online server - works anywhere! Friends can join from different locations.'}
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveServer(serverDraft)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => void saveServer('')}>🍕 Pizza Server</Button>
                    </div>
                </div>
            </details>
        </main>
    );
}
