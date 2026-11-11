import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { extractMedia, generateRandomName, isSupportedSite, sanitizeUsername } from '@watch-party/shared';
import type { PanelRequest, PanelResponse, PublicSession } from '../lib/messages';
import type { ActiveTab } from './activeTab';
import { parseRoomCode } from './roomCode';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { TextField } from './ui/TextField';

const WAKING_NOTE = 'Waking up the server — this can take up to a minute on the first party of the day.';

export function Landing({
    session,
    send,
    activeTab,
    onAbout,
}: {
    session: PublicSession | null;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    activeTab: ActiveTab | null;
    onAbout: () => void;
}) {
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

    return (
        <main className="flex h-full flex-col gap-5 overflow-y-auto bg-bg p-4 text-text">
            <header className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-card bg-cheese">
                    <img src="/icon128.png" alt="" className="h-8 w-8" />
                </span>
                <span className="flex-1 text-title font-bold">Watch Pizza Party</span>
                <button type="button" onClick={onAbout} className="text-meta font-bold text-accent-strong underline-offset-2 hover:underline dark:text-accent">
                    How it works
                </button>
            </header>

            <section className="flex flex-col gap-1">
                <h1 className="text-display font-bold">Movie night, together 🍕</h1>
                <p className="text-body text-muted">
                    Start a party, share the code, and everyone watches YouTube or Netflix in sync — with chat.
                </p>
            </section>

            <div className="flex items-center gap-2 rounded-card bg-surface px-3 py-2 shadow-[0_1px_3px_rgb(120_60_20/0.08)] dark:shadow-none">
                <label htmlFor="wpp-name" className="text-body text-muted">You'll join as</label>
                <input
                    id="wpp-name"
                    value={name}
                    maxLength={32}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-control bg-surface-2 px-3 text-body font-medium text-text"
                />
                <IconButton label="New name" onClick={() => setName(generateRandomName().name)}>
                    <RefreshCw size={14} />
                </IconButton>
            </div>

            <section className="flex flex-col gap-2">
                <Button variant="primary" className="h-11" onClick={start} disabled={!activeTab || busy} loading={busy && lastAction === 'create'}>
                    Start a party
                </Button>
                {media ? (
                    <p className="truncate text-meta text-muted">Using: {activeTab?.title || 'this video'}</p>
                ) : (
                    <p className="text-meta text-muted">You can open a YouTube or Netflix video after starting.</p>
                )}
                {status === 'waking' && <p className="rounded-control bg-warn px-3 py-2 text-meta text-warn-fg">{WAKING_NOTE}</p>}
                {sessionError && lastAction !== 'join' && <p role="alert" className="rounded-control bg-bad px-3 py-2 text-meta text-bad-fg">{sessionError}</p>}
            </section>

            <div className="flex items-center gap-3 text-meta text-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                or join a friend
                <span className="h-px flex-1 bg-line" />
            </div>

            <section className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                    <TextField
                        label="Room code"
                        mono
                        className="flex-1"
                        value={code}
                        placeholder="e.g. Jol4I72BE4"
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
                    <Button onClick={join} disabled={busy} loading={busy && lastAction === 'join'} className={codeError ? 'mb-5' : ''}>
                        Join
                    </Button>
                </div>
                {activeTab && !isSupportedSite(activeTab.url) && !codeError && (
                    <p className="text-meta text-muted">The video will open in a new tab.</p>
                )}
                {sessionError && lastAction === 'join' && <p role="alert" className="rounded-control bg-bad px-3 py-2 text-meta text-bad-fg">{sessionError}</p>}
                {busy && lastAction === null && (
                    <p className="text-meta text-muted">Rejoining your party…</p>
                )}
                {busy && (
                    <button type="button" className="self-start text-meta text-muted underline" onClick={() => void send({ type: 'session.leave' })}>
                        Cancel
                    </button>
                )}
            </section>

            <details className="mt-auto text-meta text-muted">
                <summary className="cursor-pointer select-none">Advanced</summary>
                <div className="mt-3 flex flex-col gap-2">
                    <TextField
                        label="Server"
                        mono
                        value={serverDraft}
                        onChange={(e) => {
                            setServerDraft(e.target.value);
                            setServerMessage(null);
                        }}
                        hint={serverMessage ?? 'Only change this if you run your own server.'}
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveServer(serverDraft)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => void saveServer('')}>Use default</Button>
                    </div>
                </div>
            </details>
        </main>
    );
}
