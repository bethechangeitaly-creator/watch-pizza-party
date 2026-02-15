import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

type SessionInfo = {
    active: boolean;
    roomId: string | null;
    username: string | null;
    connected: boolean;
    isHost: boolean;
    participantCount: number;
    syncProfile: string;
};

function ShareGlyph({ copied = false }: { copied?: boolean }) {
    if (copied) {
        return (
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
                <path d="M5 12.5L9.2 16.7L19 7.4" stroke="#86efac" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
            <path d="M12 14V3.8" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M8.2 7.4L12 3.5L15.8 7.4" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="5.2" y="10.8" width="13.6" height="10" rx="2.2" stroke="#93c5fd" strokeWidth="2" />
        </svg>
    );
}

function isRuntimeAvailable(): boolean {
    try {
        return Boolean(chrome?.runtime?.id);
    } catch {
        return false;
    }
}

function sendMessage<T = unknown>(msg: Record<string, unknown>): Promise<T | null> {
    return new Promise((resolve) => {
        if (!isRuntimeAvailable()) {
            resolve(null);
            return;
        }

        try {
            chrome.runtime.sendMessage(msg, (res) => {
                let hadRuntimeError = false;
                try {
                    hadRuntimeError = Boolean(chrome.runtime.lastError);
                } catch {
                    hadRuntimeError = true;
                }
                if (hadRuntimeError) {
                    resolve(null);
                    return;
                }
                resolve((res ?? null) as T | null);
            });
        } catch {
            resolve(null);
        }
    });
}

async function getActiveTabId(): Promise<number | null> {
    return new Promise((resolve) => {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs?.[0]?.id ?? null);
            });
        } catch {
            resolve(null);
        }
    });
}

function Popup() {
    const [session, setSession] = useState<SessionInfo | null>(null);
    const [serverUrl, setServerUrl] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const openedAtRef = useRef<number>(Date.now());
    const interactedRef = useRef(false);
    const restoreTriggeredRef = useRef(false);

    useEffect(() => {
        (async () => {
            const res = await sendMessage<{ state?: { active: boolean; roomId: string | null; username: string | null; connected: boolean; isHost: boolean; room: { participants: { id: string }[] } | null; syncProfile: string } }>({ type: 'WATCHPARTY_GET_SESSION_STATE' });
            const s = res?.state;
            if (s) {
                setSession({
                    active: s.active,
                    roomId: s.roomId,
                    username: s.username,
                    connected: s.connected,
                    isHost: s.isHost,
                    participantCount: s.room?.participants?.length ?? 0,
                    syncProfile: s.syncProfile || 'other',
                });
            }

            const serverRes = await sendMessage<{ serverUrl?: string }>({ type: 'WATCHPARTY_GET_SERVER_URL' });
            if (typeof serverRes?.serverUrl === 'string' && serverRes.serverUrl.trim().length > 0) {
                setServerUrl(serverRes.serverUrl.trim());
            }
            setLoading(false);
        })();
    }, []);

    const markCopied = (key: string) => {
        setCopiedKey(key);
        window.setTimeout(() => {
            setCopiedKey((current) => (current === key ? null : current));
        }, 1000);
    };

    const copyValue = async (value: string, key: string) => {
        if (!value.trim()) return;
        try {
            await navigator.clipboard.writeText(value);
            markCopied(key);
        } catch {
            // Ignore clipboard failures.
        }
    };

    const handleOpenSidebar = async () => {
        restoreTriggeredRef.current = true;
        const tabId = await getActiveTabId();
        if (tabId) {
            await sendMessage({ type: 'WATCHPARTY_RESTORE_PANEL', tabId });
        }
        window.close();
    };

    useEffect(() => {
        const markInteraction = () => {
            interactedRef.current = true;
        };

        const maybeRestoreOnQuickDismiss = () => {
            if (restoreTriggeredRef.current) return;
            if (document.visibilityState !== 'hidden') return;
            if (interactedRef.current) return;

            const elapsedMs = Date.now() - openedAtRef.current;
            if (elapsedMs > 320) return;

            restoreTriggeredRef.current = true;
            void (async () => {
                const tabId = await getActiveTabId();
                if (!tabId) return;
                await sendMessage({ type: 'WATCHPARTY_RESTORE_PANEL', tabId });
            })();
        };

        document.addEventListener('pointerdown', markInteraction, true);
        document.addEventListener('keydown', markInteraction, true);
        document.addEventListener('visibilitychange', maybeRestoreOnQuickDismiss);

        return () => {
            document.removeEventListener('pointerdown', markInteraction, true);
            document.removeEventListener('keydown', markInteraction, true);
            document.removeEventListener('visibilitychange', maybeRestoreOnQuickDismiss);
        };
    }, []);

    return (
        <div style={{
            width: '100%',
            minHeight: 120,
            background: '#0A0A0A',
            color: '#f8fafc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            padding: 16,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
                }}>
                    <img
                        src="/icon32.png"
                        alt="Watch Pizza Party"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>Watch Pizza Party</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Sync &amp; Watch Together</div>
                </div>
            </div>

            {loading ? (
                <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', padding: '12px 0' }}>
                    Loading...
                </div>
            ) : session?.active ? (
                /* Active session info */
                <div style={{
                    background: '#111',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {(() => {
                        const roomCode = (session.roomId || '').trim();
                        const serverShareText = serverUrl ? `Server URL: ${serverUrl}` : '';
                        const roomShareText = [
                            'Watch Pizza Party Invite',
                            serverUrl ? `Server URL: ${serverUrl}` : '',
                            roomCode ? `Room Code: ${roomCode}` : ''
                        ].filter(Boolean).join('\n');

                        const iconButtonStyle: React.CSSProperties = {
                            border: 'none',
                            background: 'transparent',
                            color: '#cbd5e1',
                            width: 16,
                            height: 16,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            cursor: 'pointer'
                        };

                        return (
                            <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>You</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e7eb' }}>{session.username || '—'}</span>
                            <span style={{
                                fontSize: 8,
                                fontWeight: 900,
                                padding: '2px 5px',
                                borderRadius: 3,
                                background: session.isHost ? '#facc15' : 'rgba(59,130,246,0.25)',
                                color: session.isHost ? '#000' : '#93c5fd',
                                letterSpacing: '0.04em',
                            }}>{session.isHost ? 'HOST' : 'VIEWER'}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Server</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', opacity: serverUrl ? 1 : 0.45 }}>
                                <button
                                    type="button"
                                    onClick={() => { void copyValue(serverShareText, 'server-share'); }}
                                    disabled={!serverUrl}
                                    title={serverShareText ? 'Copy server share text' : 'Server unavailable'}
                                    style={{ ...iconButtonStyle, cursor: serverUrl ? 'pointer' : 'default' }}
                                >
                                    <ShareGlyph copied={copiedKey === 'server-share'} />
                                </button>
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: session.connected ? '#22c55e' : '#ef4444',
                                boxShadow: session.connected ? '0 0 8px rgba(34,197,94,0.6)' : '0 0 8px rgba(239,68,68,0.5)',
                                display: 'inline-block',
                            }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: session.connected ? '#86efac' : '#fca5a5' }}>
                                {session.connected ? 'Connected' : 'Reconnecting'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Room</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', opacity: roomCode ? 1 : 0.45 }}>
                                <button
                                    type="button"
                                    onClick={() => { void copyValue(roomShareText, 'room-share'); }}
                                    disabled={!roomShareText}
                                    title={roomShareText ? 'Copy invite text' : 'Invite unavailable'}
                                    style={{ ...iconButtonStyle, cursor: roomShareText ? 'pointer' : 'default' }}
                                >
                                    <ShareGlyph copied={copiedKey === 'room-share'} />
                                </button>
                            </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#dbeafe', letterSpacing: '0.04em' }}>{session.roomId || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Watching</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e7eb' }}>{session.participantCount} {session.participantCount === 1 ? 'person' : 'people'}</span>
                    </div>
                            </>
                        );
                    })()}
                </div>
            ) : (
                /* No active session */
                <div style={{
                    background: '#111',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '16px 12px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>No active session</div>
                    <div style={{ fontSize: 9, color: '#4b5563', marginTop: 4 }}>Open the sidebar to create or join a room</div>
                </div>
            )}

            {/* Open Sidebar button */}
            <button
                onClick={handleOpenSidebar}
                style={{
                    width: '100%',
                    height: 34,
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                    transition: 'background 150ms ease, box-shadow 150ms ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.5)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,99,235,0.35)';
                }}
            >
                Open Full Sidebar
            </button>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('popup-root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);
