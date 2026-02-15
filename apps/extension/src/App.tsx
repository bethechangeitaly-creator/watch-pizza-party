import React, { useCallback, useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { RoomView } from './components/RoomView';
import { Room, SyncProfile, WSMessage, WSMessageSchema } from '@watch-party/shared';

type SessionStatePayload = {
    active: boolean;
    roomId: string | null;
    username: string | null;
    mediaTabId: number | null;
    room: Room | null;
    meUserId: string | null;
    connected: boolean;
    lastError: string | null;
    syncAggression: number;
    syncProfile: SyncProfile;
    isHost: boolean;
    volumeBoost: number;
};

type RuntimeResponse<T = unknown> = {
    ok: boolean;
    reason?: string;
    state?: SessionStatePayload;
} & T;

function isRuntimeAvailable(): boolean {
    try {
        return Boolean(chrome?.runtime?.id);
    } catch {
        return false;
    }
}

async function sendRuntimeMessage<T = unknown>(message: Record<string, unknown>): Promise<RuntimeResponse<T> | null> {
    return await new Promise((resolve) => {
        if (!isRuntimeAvailable()) {
            resolve(null);
            return;
        }

        try {
            chrome.runtime.sendMessage(message, (response) => {
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
                resolve((response || null) as RuntimeResponse<T> | null);
            });
        } catch {
            resolve(null);
        }
    });
}

async function clearLocalSessionStorage() {
    await new Promise<void>((resolve) => {
        chrome.storage.local.remove([
            'watchparty_active_session',
            'watchparty_active_session_regular',
            'watchparty_active_session_incognito',
            'roomId'
        ], () => {
            resolve();
        });
    });
}

async function getActiveTabId(): Promise<number | null> {
    return await new Promise((resolve) => {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                resolve(activeTab?.id ?? null);
            });
        } catch {
            resolve(null);
        }
    });
}

export default function App() {
    const [sessionState, setSessionState] = useState<SessionStatePayload | null>(null);
    const [latestMessage, setLatestMessage] = useState<WSMessage | null>(null);
    const [messageHistory, setMessageHistory] = useState<WSMessage[]>([]);
    const [messageHistoryRoomId, setMessageHistoryRoomId] = useState<string | null>(null);
    const [serverUrl, setServerUrl] = useState('http://127.0.0.1:3005');
    const [savingServerUrl, setSavingServerUrl] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>(['App started']);

    const addLog = (msg: string) => {
        setLogs((prev) => [...prev.slice(-4), msg]);
        console.log(`[WatchParty] ${msg}`);
    };

    const applySessionState = useCallback((nextState: SessionStatePayload) => {
        setSessionState(nextState);
        setConnecting(nextState.active && !nextState.room);
        if (nextState.lastError) {
            setError(nextState.lastError);
        }
        if (!nextState.active) {
            setLatestMessage(null);
            setMessageHistory([]);
            setMessageHistoryRoomId(null);
        }
    }, []);

    const syncActiveTab = useCallback(async () => {
        const tabId = await getActiveTabId();
        if (!tabId) return;
        void sendRuntimeMessage({ type: 'WATCHPARTY_UPDATE_ACTIVE_TAB', tabId });
    }, []);

    useEffect(() => {
        addLog('Dashboard Ready');

        const handleRuntimeMessage = (raw: unknown) => {
            const msg = raw as { type?: string; payload?: unknown };
            if (msg.type === 'WATCHPARTY_SESSION_STATE' && msg.payload) {
                applySessionState(msg.payload as SessionStatePayload);
                return;
            }

            if (msg.type === 'WATCHPARTY_WS_MESSAGE' && msg.payload) {
                const parsed = WSMessageSchema.safeParse(msg.payload);
                if (!parsed.success) return;
                const wsMessage = parsed.data;
                setLatestMessage(wsMessage);
                if (wsMessage.type === 'error') {
                    setError(wsMessage.payload.message);
                    addLog(`Server Error: ${wsMessage.payload.message}`);
                }
            }
        };

        try {
            chrome.runtime.onMessage.addListener(handleRuntimeMessage);
        } catch {
            // Ignore runtime listener errors when extension context is unavailable.
        }

        void sendRuntimeMessage<{ state?: SessionStatePayload }>({ type: 'WATCHPARTY_GET_SESSION_STATE' }).then((response) => {
            if (response?.ok && response.state) {
                applySessionState(response.state);
            }
        });

        void sendRuntimeMessage<{ serverUrl?: string }>({ type: 'WATCHPARTY_GET_SERVER_URL' }).then((response) => {
            if (response?.ok && typeof response.serverUrl === 'string' && response.serverUrl.trim()) {
                setServerUrl(response.serverUrl);
            }
        });

        void syncActiveTab();

        return () => {
            try {
                chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
            } catch {
                // Ignore listener cleanup errors.
            }
        };
    }, [applySessionState, syncActiveTab]);

    useEffect(() => {
        let panelPort: chrome.runtime.Port | null = null;
        try {
            panelPort = chrome.runtime.connect({ name: 'watchparty-panel' });
        } catch {
            return;
        }

        let disposed = false;
        let portDisconnected = false;
        const handleDisconnect = () => {
            portDisconnected = true;
        };
        panelPort.onDisconnect.addListener(handleDisconnect);

        const sendPanelHeartbeat = async () => {
            if (disposed || portDisconnected || !panelPort) return;
            const tabId = await getActiveTabId();
            if (disposed || portDisconnected || !panelPort) return;
            try {
                panelPort.postMessage({ type: 'panel.heartbeat', tabId });
            } catch {
                portDisconnected = true;
            }
        };

        void sendPanelHeartbeat();
        const heartbeatTimer = window.setInterval(() => {
            void sendPanelHeartbeat();
        }, 3000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void sendPanelHeartbeat();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleVisibilityChange);

        return () => {
            disposed = true;
            window.clearInterval(heartbeatTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleVisibilityChange);
            try {
                panelPort?.onDisconnect.removeListener(handleDisconnect);
            } catch {
                // Ignore listener cleanup errors.
            }
            try {
                panelPort?.disconnect();
            } catch {
                // Ignore disconnect issues during teardown.
            }
        };
    }, []);

    useEffect(() => {
        if (sessionState?.active) {
            void syncActiveTab();
        }
    }, [sessionState?.active, syncActiveTab]);

    useEffect(() => {
        const roomId = sessionState?.room?.id;
        if (!sessionState?.active || !roomId) {
            setMessageHistory([]);
            setMessageHistoryRoomId(null);
            return;
        }

        let cancelled = false;
        setMessageHistoryRoomId(roomId);
        setMessageHistory([]);

        void sendRuntimeMessage<{ history?: unknown[] }>({ type: 'WATCHPARTY_GET_CHAT_HISTORY', roomId })
            .then((response) => {
                if (cancelled) return;
                if (!response?.ok || !Array.isArray(response.history)) {
                    setMessageHistory([]);
                    return;
                }

                const history: WSMessage[] = [];
                for (const rawMessage of response.history) {
                    const parsed = WSMessageSchema.safeParse(rawMessage);
                    if (!parsed.success) continue;
                    if (parsed.data.type === 'chat.message' || parsed.data.type === 'sync.system_event') {
                        history.push(parsed.data);
                    }
                }

                setMessageHistory(history);
            })
            .catch(() => {
                if (!cancelled) {
                    setMessageHistory([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [sessionState?.active, sessionState?.room?.id]);

    const handleJoin = async (roomId: string, username: string) => {
        setError(null);
        setConnecting(true);
        setLatestMessage(null);
        setMessageHistory([]);
        setMessageHistoryRoomId(null);
        addLog(`Join Request: #${roomId}`);

        const tabId = await getActiveTabId();
        const response = await sendRuntimeMessage<{ state?: SessionStatePayload }>({
            type: 'WATCHPARTY_START_SESSION',
            roomId,
            username,
            tabId
        });

        if (!response?.ok) {
            setConnecting(false);
            const reason = response?.reason || 'Could not start background session.';
            setError(reason);
            addLog(`Start session failed: ${reason}`);
            if (!response) {
                await clearLocalSessionStorage();
            }
            return;
        }

        if (response.state) {
            applySessionState(response.state);
        }
    };

    const handleLeave = () => {
        addLog('Leaving party');
        void sendRuntimeMessage<{ state?: SessionStatePayload }>({ type: 'WATCHPARTY_LEAVE_SESSION' }).then((response) => {
            if (response?.state) {
                applySessionState(response.state);
            } else {
                setSessionState(null);
                setConnecting(false);
                void clearLocalSessionStorage();
            }
            setLatestMessage(null);
            setMessageHistory([]);
            setMessageHistoryRoomId(null);
            setError(null);
        });
    };

    const handleSendChat = (text: string) => {
        void sendRuntimeMessage({ type: 'WATCHPARTY_SEND_CHAT', text });
    };

    const handleManualSync = async () => {
        await sendRuntimeMessage({ type: 'WATCHPARTY_MANUAL_SYNC' });
    };

    const handleViewerRequestSync = async (reason?: string) => {
        await sendRuntimeMessage({ type: 'WATCHPARTY_REQUEST_SYNC', reason });
    };

    const handleSetSyncAggression = (value: number) => {
        void sendRuntimeMessage({ type: 'WATCHPARTY_SET_SYNC_AGGRESSION', value });
    };

    const handleSetVolumeBoost = (value: number) => {
        void sendRuntimeMessage({ type: 'WATCHPARTY_SET_VOLUME_BOOST', value });
    };

    const handleSaveServerUrl = async (nextUrl: string) => {
        setSavingServerUrl(true);
        try {
            const response = await sendRuntimeMessage<{ serverUrl?: string }>({
                type: 'WATCHPARTY_SET_SERVER_URL',
                url: nextUrl
            });

            if (!response?.ok || typeof response.serverUrl !== 'string' || !response.serverUrl.trim()) {
                throw new Error(response?.reason || 'Could not save server URL');
            }

            setServerUrl(response.serverUrl);
            setError(null);
        } finally {
            setSavingServerUrl(false);
        }
    };

    const room = sessionState?.room || null;
    const username = sessionState?.username || '';
    const shouldShowConnecting = (connecting || Boolean(sessionState?.active)) && !room;

    useEffect(() => {
        if (!shouldShowConnecting) return;

        const timeoutId = window.setTimeout(() => {
            const timeoutError = 'Connection timed out. Session reset. Please create or join again.';
            setLogs((prev) => [...prev.slice(-4), 'Connection timeout, resetting session']);
            setSessionState(null);
            setConnecting(false);
            setLatestMessage(null);
            setError(timeoutError);
            void clearLocalSessionStorage();
            void sendRuntimeMessage({ type: 'WATCHPARTY_LEAVE_SESSION' });
        }, 20000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [shouldShowConnecting]);

    if (shouldShowConnecting) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black px-8">
                <div className="relative mb-10 scale-110">
                    <div className="w-14 h-14 border-4 border-blue-600/10 rounded-full" />
                    <div className="absolute inset-0 w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(37,99,235,0.4)]" />
                </div>

                <div className="space-y-1 w-full text-center">
                    <p className="text-white font-black text-xl tracking-tight">Syncing Room</p>
                    <p className="text-gray-600 text-[10px] uppercase tracking-widest font-bold pb-8">Securing Handshake</p>

                    <div className="bg-[#0A0A0A] rounded-3xl p-5 border border-white/5 space-y-3 text-left shadow-2xl">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-blue-500 font-mono text-[9px] mt-1">#</span>
                                <p className={`text-[10px] font-mono leading-relaxed tracking-tight ${i === logs.length - 1 ? 'text-blue-400 font-bold' : 'text-gray-700'}`}>
                                    {log}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleLeave}
                    className="mt-14 text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-[0.3em] transition-all"
                >
                    Cancel Connection
                </button>
            </div>
        );
    }

    if (!sessionState?.active || !room || !username) {
        return (
            <Landing
                onJoin={handleJoin}
                externalError={error || sessionState?.lastError || null}
                serverUrl={serverUrl}
                serverUrlSaving={savingServerUrl}
                onSaveServerUrl={handleSaveServerUrl}
            />
        );
    }

    return (
        <RoomView
            room={room}
            username={username}
            serverUrl={serverUrl}
            serverConnected={Boolean(sessionState.connected)}
            serverLastError={sessionState.lastError}
            latestMessage={latestMessage}
            messageHistory={messageHistory}
            messageHistoryRoomId={messageHistoryRoomId}
            syncAggressionSetting={sessionState.syncAggression}
            syncProfileSetting={sessionState.syncProfile}
            onLeave={handleLeave}
            onSendChat={handleSendChat}
            onManualSync={handleManualSync}
            onViewerRequestSync={handleViewerRequestSync}
            onSetSyncAggression={handleSetSyncAggression}
            volumeBoostSetting={sessionState.volumeBoost ?? 100}
            onSetVolumeBoost={handleSetVolumeBoost}
        />
    );
}
