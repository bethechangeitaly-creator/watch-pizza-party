import React, { useEffect, useRef, useState } from 'react';
import { Room, SyncProfile, WSMessage } from '@watch-party/shared';
import { Chat } from './Chat';
import { CreditsModal } from './CreditsModal';
import { LogOut, Copy, Crown, Users, RefreshCw, AlertCircle, AlertTriangle, Minimize2, Volume2, VolumeX, Mail, MessageCircle, Sun, Moon, SkipBack, Pause, Play, SkipForward, ChevronRight, ChevronDown, X, Power, Heart } from 'lucide-react';

interface RoomViewProps {
    room: Room;
    username: string;
    serverUrl: string;
    serverConnected: boolean;
    serverLastError?: string | null;
    latestMessage: WSMessage | null;
    messageHistory: WSMessage[];
    messageHistoryRoomId: string | null;
    syncAggressionSetting: number;
    syncProfileSetting: SyncProfile;
    onLeave: () => void;
    onSendChat: (text: string) => void;
    onManualSync: () => Promise<void> | void;
    onViewerRequestSync: (reason?: string) => Promise<void> | void;
    onSetSyncAggression: (value: number) => void;
    volumeBoostSetting: number;
    onSetVolumeBoost: (value: number) => void;
}

const DEFAULT_SYNC_AGGRESSION = 50;
const CHAT_SOUNDS_STORAGE_KEY = 'watch_party_chat_sounds_enabled';
const UI_THEME_STORAGE_KEY = 'watch_party_ui_theme';
const HEADER_COLLAPSED_STORAGE_KEY = 'watch_party_header_collapsed';
const DONATION_REMINDER_INTERVAL_MS = 40 * 60 * 1000; // 40 minutes

type SyncTuning = {
    hardToleranceSeconds: number;
    softTriggerSeconds: number;
};

type ViewerRequestReason =
    | 'manual-request'
    | 'control-back'
    | 'control-pause'
    | 'control-play'
    | 'control-forward';

function clampSyncAggression(raw: number | null | undefined): number {
    if (!Number.isFinite(raw)) return DEFAULT_SYNC_AGGRESSION;
    return Math.max(0, Math.min(100, Number(raw)));
}

function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

function getSyncTuning(syncAggression: number | null | undefined): SyncTuning {
    const normalized = clampSyncAggression(syncAggression) / 100;
    const driftTolerance = lerp(8.0, 0.8, normalized);
    return {
        hardToleranceSeconds: driftTolerance,
        softTriggerSeconds: driftTolerance * 0.4
    };
}

function formatToleranceLabel(seconds: number): string {
    const precision = seconds >= 3 ? 1 : 2;
    return `${seconds.toFixed(precision)}s`;
}

function syncModeLabel(syncAggression: number): string {
    if (syncAggression <= 20) return 'Very Flexible';
    if (syncAggression <= 40) return 'Flexible';
    if (syncAggression <= 60) return 'Balanced';
    if (syncAggression <= 80) return 'Tight';
    return 'Very Tight';
}

function syncProfileLabel(profile: SyncProfile): string {
    if (profile === 'youtube') return 'YouTube';
    if (profile === 'netflix') return 'Netflix';
    return 'Other';
}

function getActiveTabInCurrentWindow(): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
                resolve(activeTab);
                return;
            }

            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
                const fallbackTab = fallbackTabs[0];
                if (!fallbackTab?.id) {
                    resolve(null);
                    return;
                }
                resolve(fallbackTab);
            });
        });
    });
}

export function RoomView({
    room,
    username,
    serverUrl,
    serverConnected,
    serverLastError,
    latestMessage,
    messageHistory,
    messageHistoryRoomId,
    syncAggressionSetting,
    syncProfileSetting,
    onLeave,
    onSendChat,
    onManualSync,
    onViewerRequestSync,
    onSetSyncAggression,
    volumeBoostSetting,
    onSetVolumeBoost
}: RoomViewProps) {
    const [showCopied, setShowCopied] = useState(false);
    const [topCopyState, setTopCopyState] = useState<'room' | null>(null);
    const [manualSyncing, setManualSyncing] = useState(false);
    const [requestingSync, setRequestingSync] = useState(false);
    const [emailShareBusy, setEmailShareBusy] = useState(false);
    const [hostChangeNotice, setHostChangeNotice] = useState<string | null>(null);
    const [showViewerSyncEvents, setShowViewerSyncEvents] = useState(false);
    const [viewerRequestBusy, setViewerRequestBusy] = useState<ViewerRequestReason | null>(null);
    const [showCredits, setShowCredits] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [uiTheme, setUiTheme] = useState<'dark' | 'light'>(() => {
        try {
            const raw = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
            if (raw === 'light') return 'light';
        } catch {
            // Ignore storage failures.
        }
        return 'dark';
    });
    const [chatSoundsEnabled, setChatSoundsEnabled] = useState<boolean>(() => {
        try {
            const raw = window.localStorage.getItem(CHAT_SOUNDS_STORAGE_KEY);
            if (raw === 'false') return false;
        } catch {
            // Ignore storage failures.
        }
        return true;
    });
    const [syncAggression, setSyncAggression] = useState<number>(clampSyncAggression(syncAggressionSetting));
    const [volumeBoost, setVolumeBoost] = useState<number>(volumeBoostSetting);
    const [showDonationReminder, setShowDonationReminder] = useState(false);
    const donationTimerRef = useRef<number | null>(null);
    const me = room.participants.find((participant) => participant.username === username);
    const isHost = room.hostId === me?.id;

    const [headerCollapsed, setHeaderCollapsed] = useState<{
        buttons: boolean;
        sync: boolean;
        participants: boolean;
    }>(() => {
        try {
            const raw = window.localStorage.getItem(HEADER_COLLAPSED_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { buttons: true, sync: true, participants: false, ...parsed };
            }
        } catch { /* ignore */ }
        // Default for host: invite collapsed, sync collapsed, participants open
        // Default for viewer: all sections open (buttons, participants visible)
        // Viewers don't see sync section, so it doesn't matter
        return { buttons: isHost, sync: true, participants: false };
    });
    const isLightMode = uiTheme === 'light';
    const hostSyncTuning = getSyncTuning(syncAggression);
    const previousHostIdRef = useRef(room.hostId);
    const lastEmailShareAtRef = useRef(0);
    const needSyncAudioContextRef = useRef<AudioContext | null>(null);
    const lastNeedSyncEventRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

    useEffect(() => {
        setSyncAggression(clampSyncAggression(syncAggressionSetting));
    }, [syncAggressionSetting]);

    useEffect(() => {
        setVolumeBoost(volumeBoostSetting);
    }, [volumeBoostSetting]);

    useEffect(() => {
        try {
            window.localStorage.setItem(CHAT_SOUNDS_STORAGE_KEY, chatSoundsEnabled ? 'true' : 'false');
        } catch {
            // Ignore storage failures.
        }
    }, [chatSoundsEnabled]);

    useEffect(() => {
        try {
            window.localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme);
        } catch {
            // Ignore storage failures.
        }
    }, [uiTheme]);

    useEffect(() => {
        try {
            window.localStorage.setItem(HEADER_COLLAPSED_STORAGE_KEY, JSON.stringify(headerCollapsed));
        } catch { /* ignore */ }
    }, [headerCollapsed]);

    useEffect(() => {
        const previousHostId = previousHostIdRef.current;
        if (previousHostId === room.hostId) return;

        const newHost = room.participants.find((participant) => participant.id === room.hostId);
        if (newHost) {
            setHostChangeNotice(
                newHost.username === username
                    ? 'You are now the host'
                    : `${newHost.username} is now the host`
            );
            window.setTimeout(() => {
                setHostChangeNotice(null);
            }, 3800);
        }
        previousHostIdRef.current = room.hostId;
    }, [room.hostId, room.participants, username]);

    useEffect(() => {
        void getActiveTabInCurrentWindow().then((activeTab) => {
            if (!activeTab?.id) return;
            chrome.runtime.sendMessage({ type: 'WATCHPARTY_UPDATE_ACTIVE_TAB', tabId: activeTab.id }, () => {
                void chrome.runtime.lastError;
            });
            chrome.tabs.sendMessage(activeTab.id, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' }, () => {
                void chrome.runtime.lastError;
            });
        });
    }, []);

    const normalizeViewerRequestReason = (rawReason: string | null | undefined): ViewerRequestReason => {
        const reason = (rawReason || '').trim();
        if (reason === 'control-back') return reason;
        if (reason === 'control-pause') return reason;
        if (reason === 'control-play') return reason;
        if (reason === 'control-forward') return reason;
        return 'manual-request';
    };

    const playNeedSyncTone = (rawReason?: string | null) => {
        try {
            const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;

            if (!needSyncAudioContextRef.current) {
                needSyncAudioContextRef.current = new AudioCtx();
            }
            const context = needSyncAudioContextRef.current;
            if (!context) return;
            if (context.state === 'suspended') {
                void context.resume();
            }

            const reason = normalizeViewerRequestReason(rawReason);
            const toneProfile: Record<ViewerRequestReason, { from: number; to: number; filter: number }> = {
                'manual-request': { from: 520, to: 690, filter: 920 },
                'control-back': { from: 410, to: 520, filter: 760 },
                'control-pause': { from: 470, to: 420, filter: 700 },
                'control-play': { from: 620, to: 760, filter: 1040 },
                'control-forward': { from: 700, to: 860, filter: 1160 }
            };
            const profile = toneProfile[reason];
            const now = context.currentTime;
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();
            const filter = context.createBiquadFilter();

            filter.type = 'lowpass';
            filter.frequency.value = profile.filter;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(profile.from, now);
            oscillator.frequency.exponentialRampToValueAtTime(profile.to, now + 0.11);
            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.exponentialRampToValueAtTime(0.03, now + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

            oscillator.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start(now);
            oscillator.stop(now + 0.24);
        } catch {
            // Best effort only.
        }
    };

    useEffect(() => {
        if (!isHost) return;
        if (!latestMessage || latestMessage.type !== 'sync.viewer_request_sync') return;

        const reason = normalizeViewerRequestReason(latestMessage.payload.reason);
        const eventKey = `${latestMessage.payload.username || ''}:${reason}`;
        const now = Date.now();
        const previous = lastNeedSyncEventRef.current;
        if (previous.key === eventKey && now - previous.at < 550) return;
        lastNeedSyncEventRef.current = { key: eventKey, at: now };
        playNeedSyncTone(reason);
    }, [isHost, latestMessage]);

    // Donation reminder timer - shows after 40 minutes of room usage
    useEffect(() => {
        const startDonationTimer = () => {
            // Clear any existing timer
            if (donationTimerRef.current !== null) {
                window.clearTimeout(donationTimerRef.current);
            }

            // Start new 40-minute timer
            donationTimerRef.current = window.setTimeout(() => {
                setShowDonationReminder(true);
            }, DONATION_REMINDER_INTERVAL_MS);
        };

        // Start timer when component mounts
        startDonationTimer();

        // Cleanup timer on unmount
        return () => {
            if (donationTimerRef.current !== null) {
                window.clearTimeout(donationTimerRef.current);
                donationTimerRef.current = null;
            }
        };
    }, []);

    const handleCloseDonationReminder = () => {
        setShowDonationReminder(false);

        // Restart the 40-minute timer
        if (donationTimerRef.current !== null) {
            window.clearTimeout(donationTimerRef.current);
        }

        donationTimerRef.current = window.setTimeout(() => {
            setShowDonationReminder(true);
        }, DONATION_REMINDER_INTERVAL_MS);
    };

    const handleManualSync = async () => {
        if (!isHost || manualSyncing) return;
        setManualSyncing(true);
        try {
            await onManualSync();
        } finally {
            window.setTimeout(() => {
                setManualSyncing(false);
            }, 700);
        }
    };

    const sendViewerRequest = async (reason: ViewerRequestReason) => {
        if (isHost || viewerRequestBusy) return;
        setViewerRequestBusy(reason);
        if (reason === 'manual-request') {
            setRequestingSync(true);
        }
        playNeedSyncTone(reason);
        try {
            await onViewerRequestSync(reason);
        } finally {
            window.setTimeout(() => {
                setViewerRequestBusy((previous) => (previous === reason ? null : previous));
                if (reason === 'manual-request') {
                    setRequestingSync(false);
                }
            }, reason === 'manual-request' ? 1200 : 700);
        }
    };

    const handleViewerRequestSync = async () => {
        await sendViewerRequest('manual-request');
    };

    const handleViewerControlRequest = async (reason: ViewerRequestReason) => {
        if (reason === 'manual-request') return;
        await sendViewerRequest(reason);
    };

    const handleSyncAggressionInput = (value: number) => {
        setSyncAggression(clampSyncAggression(value));
    };

    const handleSyncAggressionCommit = () => {
        onSetSyncAggression(syncAggression);
    };

    const handleVolumeBoostInput = (value: number) => {
        setVolumeBoost(Math.max(0, Math.min(600, Math.round(value))));
    };

    const handleVolumeBoostCommit = () => {
        onSetVolumeBoost(volumeBoost);
    };

    const toggleSection = (key: 'buttons' | 'sync' | 'participants') => {
        setHeaderCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleMinimize = () => {
        void getActiveTabInCurrentWindow().then((activeTab) => {
            if (!activeTab?.id) {
                console.warn('[WatchParty] Minimize aborted: could not resolve active tab.');
                return;
            }

            chrome.runtime.sendMessage(
                { type: 'WATCHPARTY_MINIMIZE_PANEL', tabId: activeTab.id },
                (response?: { ok?: boolean }) => {
                    if (chrome.runtime.lastError || response?.ok !== true) {
                        console.warn('[WatchParty] Minimize failed.', chrome.runtime.lastError?.message, response);
                        return;
                    }

                    try {
                        window.close();
                    } catch {
                        // Keep panel open if browser blocks close.
                    }
                }
            );
        });
    };

    const handleToggleChatSounds = () => {
        setChatSoundsEnabled((previous) => !previous);
    };

    const handleCloseExtension = () => {
        // First leave the session/room
        onLeave();

        // Then close the extension window
        try {
            window.close();
        } catch (error) {
            console.warn('[WatchParty] Failed to close window:', error);
        }
    };

    const copyRoomCode = async () => {
        try {
            await navigator.clipboard.writeText(room.id);
            setTopCopyState('room');
            window.setTimeout(() => setTopCopyState((prev) => (prev === 'room' ? null : prev)), 1400);
        } catch {
            // Ignore clipboard failures.
        }
    };

    const inviteText = [
        '🍕 Watch Pizza Party Invite',
        '',
        `Room Code: ${room.id}`,
        '',
        'Open the Watch Pizza Party extension and join with this code!'
    ].join('\n');

    const copyInvite = () => {
        void navigator.clipboard.writeText(inviteText);
        setShowCopied(true);
        window.setTimeout(() => setShowCopied(false), 2000);
    };

    const shareByWhatsApp = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const shareByEmail = () => {
        const now = Date.now();
        if (emailShareBusy || now - lastEmailShareAtRef.current < 1500) return;
        lastEmailShareAtRef.current = now;
        setEmailShareBusy(true);

        const subject = encodeURIComponent('Watch Pizza Party Room Invite');
        const body = encodeURIComponent(inviteText);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;

        window.setTimeout(() => {
            setEmailShareBusy(false);
        }, 1600);
    };

    const serverStatus: 'active' | 'error' | 'restart' = serverConnected
        ? 'active'
        : serverLastError
            ? 'error'
            : 'restart';
    const serverStatusLabel =
        serverStatus === 'active'
            ? 'Active'
            : serverStatus === 'error'
                ? 'Not working'
                : 'To restart';
    const serverLedClass =
        serverStatus === 'active'
            ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]'
            : serverStatus === 'error'
                ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.75)]'
                : 'bg-gray-400 shadow-[0_0_10px_rgba(156,163,175,0.55)]';
    const viewerRequestDisabled = Boolean(viewerRequestBusy);

    return (
        <div className={`relative h-screen overflow-hidden ${isLightMode ? 'bg-[#E9EDF6] text-slate-900' : 'bg-black text-white'}`}>
            <div className="watchparty-slide-panel h-full">
                <div className={`relative flex h-full min-h-0 flex-col ${isLightMode ? 'bg-[#F5F8FF]' : 'bg-[#0A0A0A]'}`}>
                    <div className={`border-b px-4 pb-4 pt-4 ${isLightMode ? 'border-slate-200/70' : 'border-white/5'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCredits(true)}
                                        className="watchparty-logo-pulse flex h-6 w-6 items-center justify-center overflow-hidden rounded bg-blue-600"
                                        title="About Watch Pizza Party"
                                    >
                                        <img src="/icon32.png" alt="Watch Pizza Party" className="h-full w-full object-cover" />
                                    </button>
                                    <span className={`truncate text-[10px] font-bold tracking-widest ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>ROOM: {room.id}</span>
                                    <button
                                        type="button"
                                        onClick={copyRoomCode}
                                        className={`rounded-md p-1 transition-colors ${topCopyState === 'room'
                                            ? (isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300')
                                            : (isLightMode ? 'text-slate-500 hover:bg-slate-100 hover:text-blue-600' : 'text-gray-500 hover:bg-white/5 hover:text-blue-200')
                                            }`}
                                        title="Copy room code"
                                    >
                                        <Copy size={11} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    onClick={handleMinimize}
                                    className={`rounded-full p-2 transition-colors ${isLightMode ? 'text-slate-500 hover:bg-slate-100 hover:text-blue-600' : 'text-gray-500 hover:bg-white/5 hover:text-blue-200'}`}
                                    title="Minimize sidebar"
                                >
                                    <Minimize2 size={15} />
                                </button>
                                <button
                                    onClick={handleToggleChatSounds}
                                    className={`rounded-full p-2 transition-colors ${isLightMode ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700' : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'}`}
                                    title={chatSoundsEnabled ? 'Mute chat sounds' : 'Enable chat sounds'}
                                >
                                    {chatSoundsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                                </button>
                                <button
                                    onClick={onLeave}
                                    className="rounded-full p-2 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500"
                                    title="Leave room"
                                >
                                    <LogOut size={15} />
                                </button>
                                <button
                                    onClick={() => setShowCloseConfirm(true)}
                                    className="rounded-full bg-red-500 p-2 text-white transition-all hover:bg-red-600 hover:scale-110"
                                    title="Close extension"
                                >
                                    <Power size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <div className={`flex h-8 min-w-0 items-center gap-2 rounded-lg px-2.5 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                                <span
                                    title={username}
                                    className={`min-w-0 flex-1 truncate text-[11px] font-black ${isLightMode ? 'text-slate-900' : 'text-white'}`}
                                >
                                    {username}
                                </span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black tracking-wide ${isHost ? 'bg-yellow-400 text-black' : 'border border-blue-400/30 bg-blue-500/25 text-blue-300'}`}>
                                    {isHost ? 'HOST' : 'VIEWER'}
                                </span>
                            </div>

                            <div
                                title={serverStatusLabel}
                                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}
                            >
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>SERVER STATUS</span>
                                <span className={`h-2 w-2 shrink-0 rounded-full ${serverLedClass}`} />
                            </div>
                        </div>

                        {/* Donation Reminder Banner */}
                        {showDonationReminder && (
                            <div className={`mt-3 rounded-xl border-2 p-3 animate-in slide-in-from-top-2 duration-300 ${isLightMode ? 'border-orange-300 bg-orange-50' : 'border-orange-500/40 bg-gradient-to-br from-orange-950/40 to-orange-900/20'}`}>
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-lg">🍕</span>
                                            <h3 className={`text-[11px] font-black ${isLightMode ? 'text-orange-800' : 'text-orange-300'}`}>
                                                Support Our Free Server
                                            </h3>
                                        </div>
                                        <p className={`text-[9px] leading-relaxed mb-2 ${isLightMode ? 'text-orange-700' : 'text-gray-300'}`}>
                                            Keeping the Pizza Server online costs money. Your donation helps us keep it free for everyone!
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                window.open('https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG', '_blank', 'noopener,noreferrer');
                                            }}
                                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 ${isLightMode ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md' : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/50'}`}
                                        >
                                            <Heart size={11} className="fill-current" />
                                            Donate a Slice
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCloseDonationReminder}
                                        className={`shrink-0 rounded-full p-1 transition-colors ${isLightMode ? 'text-orange-600 hover:bg-orange-200' : 'text-orange-400 hover:bg-orange-500/20'}`}
                                        title="Close"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {isHost && (
                            <div className={`mt-3 rounded-xl px-3 py-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                                <button
                                    type="button"
                                    onClick={() => toggleSection('buttons')}
                                    className={`flex w-full items-center justify-between py-1 ${isLightMode ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Invite to Join</span>
                                    {headerCollapsed.buttons ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {!headerCollapsed.buttons && (
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            onClick={copyInvite}
                                            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-bold tracking-wide transition-colors ${isLightMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-600/90 text-white hover:bg-blue-500'}`}
                                            title="Copy invite text"
                                        >
                                            <Copy size={12} />
                                            Copy Invite
                                        </button>
                                        <button
                                            onClick={shareByWhatsApp}
                                            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-bold tracking-wide transition-colors ${isLightMode ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30'}`}
                                            title="Share via WhatsApp"
                                        >
                                            <MessageCircle size={12} />
                                            WhatsApp
                                        </button>
                                        <button
                                            onClick={shareByEmail}
                                            disabled={emailShareBusy}
                                            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isLightMode ? 'bg-violet-500 text-white hover:bg-violet-600' : 'bg-violet-600/15 text-violet-200 hover:bg-violet-600/25'}`}
                                            title="Share via Email"
                                        >
                                            <Mail size={12} />
                                            {emailShareBusy ? 'Sending…' : 'Email'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!isHost && (
                            <div className={`mt-3 rounded-xl px-3 py-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                                <button
                                    type="button"
                                    onClick={() => toggleSection('buttons')}
                                    className={`flex w-full items-center justify-between py-1 ${isLightMode ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Actions</span>
                                    {headerCollapsed.buttons ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {!headerCollapsed.buttons && (
                                    <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                                        <div className={`inline-flex h-7 items-center overflow-hidden rounded-md border ${isLightMode ? 'border-slate-300 bg-slate-100' : 'border-white/10 bg-white/5'}`}>
                                            <button
                                                type="button"
                                                onClick={() => void handleViewerControlRequest('control-back')}
                                                disabled={viewerRequestDisabled}
                                                className={`inline-flex h-7 w-7 items-center justify-center border-r transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${viewerRequestBusy === 'control-back' ? (isLightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-200') : (isLightMode ? 'border-slate-300 text-slate-600 hover:bg-slate-200' : 'border-white/10 text-gray-400 hover:bg-white/10 hover:text-white')}`}
                                                title="Ask host: go back"
                                            >
                                                <SkipBack size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleViewerControlRequest('control-pause')}
                                                disabled={viewerRequestDisabled}
                                                className={`inline-flex h-7 w-7 items-center justify-center border-r transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${viewerRequestBusy === 'control-pause' ? (isLightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-200') : (isLightMode ? 'border-slate-300 text-slate-600 hover:bg-slate-200' : 'border-white/10 text-gray-400 hover:bg-white/10 hover:text-white')}`}
                                                title="Ask host: pause"
                                            >
                                                <Pause size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleViewerControlRequest('control-play')}
                                                disabled={viewerRequestDisabled}
                                                className={`inline-flex h-7 w-7 items-center justify-center border-r transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${viewerRequestBusy === 'control-play' ? (isLightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-200') : (isLightMode ? 'border-slate-300 text-slate-600 hover:bg-slate-200' : 'border-white/10 text-gray-400 hover:bg-white/10 hover:text-white')}`}
                                                title="Ask host: play"
                                            >
                                                <Play size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleViewerControlRequest('control-forward')}
                                                disabled={viewerRequestDisabled}
                                                className={`inline-flex h-7 w-7 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${viewerRequestBusy === 'control-forward' ? (isLightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-200') : (isLightMode ? 'text-slate-600 hover:bg-slate-200' : 'text-gray-400 hover:bg-white/10 hover:text-white')}`}
                                                title="Ask host: go forward"
                                            >
                                                <SkipForward size={11} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleViewerRequestSync}
                                            disabled={requestingSync || viewerRequestDisabled}
                                            className={`flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[9px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isLightMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200' : 'bg-orange-600/15 text-orange-300 hover:bg-orange-600/25'}`}
                                            title="Ask host to sync now"
                                        >
                                            <AlertCircle size={11} />
                                            Need Sync
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {isHost && showCopied && (
                            <div className={`mt-2 rounded-md px-2 py-1 text-[9px] font-bold ${isLightMode ? 'border border-blue-200 bg-blue-50 text-blue-700' : 'border border-blue-400/30 bg-blue-500/10 text-blue-200'}`}>
                                Invite text copied to clipboard
                            </div>
                        )}

                        {hostChangeNotice && (
                            <div className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-[10px] font-bold text-yellow-100">
                                {hostChangeNotice}
                            </div>
                        )}

                        {isHost && (
                            <div className={`mt-3 rounded-xl px-3 py-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                                <button
                                    type="button"
                                    onClick={() => toggleSection('sync')}
                                    className={`flex w-full items-center justify-between py-1 ${isLightMode ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Sync Flexibility</span>
                                    <div className="flex items-center gap-2">
                                        {headerCollapsed.sync && (
                                            <span className={`text-[9px] font-medium ${isLightMode ? 'text-blue-700' : 'text-blue-300'}`}>
                                                {syncModeLabel(syncAggression)} ({syncAggression})
                                            </span>
                                        )}
                                        {headerCollapsed.sync ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                    </div>
                                </button>
                                {!headerCollapsed.sync && (
                                    <>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                onClick={handleManualSync}
                                                disabled={manualSyncing}
                                                className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isLightMode ? 'bg-sky-100 text-blue-700 hover:bg-sky-200 border border-sky-200' : 'bg-blue-600/15 text-blue-300 hover:bg-blue-600/25'}`}
                                            >
                                                <RefreshCw size={12} className={manualSyncing ? 'animate-spin' : ''} />
                                                Sync Now
                                            </button>
                                        </div>
                                        <div className={`mt-2 text-[8px] font-medium ${isLightMode ? 'text-slate-500' : 'text-gray-500'}`}>
                                            Profile auto-selected from host page: {syncProfileLabel(syncProfileSetting)}
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <span className={`text-[9px] font-medium ${isLightMode ? 'text-slate-600' : 'text-gray-500'}`}>Flexible</span>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={syncAggression}
                                                onChange={(e) => handleSyncAggressionInput(Number(e.target.value))}
                                                onDoubleClick={() => {
                                                    handleSyncAggressionInput(DEFAULT_SYNC_AGGRESSION);
                                                    onSetSyncAggression(DEFAULT_SYNC_AGGRESSION);
                                                }}
                                                onMouseUp={handleSyncAggressionCommit}
                                                onTouchEnd={handleSyncAggressionCommit}
                                                onKeyUp={handleSyncAggressionCommit}
                                                className={`h-1 flex-1 cursor-pointer appearance-none rounded-full ${isLightMode ? 'bg-slate-300 accent-blue-600' : 'bg-white/20 accent-blue-500'}`}
                                            />
                                            <span className={`text-[9px] font-medium ${isLightMode ? 'text-slate-600' : 'text-gray-500'}`}>Tight</span>
                                        </div>
                                        <div className={`mt-1 text-[9px] font-medium ${isLightMode ? 'text-slate-500' : 'text-gray-500'}`}>
                                            Sync margin: ±{formatToleranceLabel(hostSyncTuning.hardToleranceSeconds)}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className={`mt-3 rounded-xl px-3 py-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                            <button
                                type="button"
                                onClick={() => toggleSection('participants')}
                                className={`flex w-full items-center justify-between py-1 ${isLightMode ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                <span className="text-[9px] font-bold uppercase tracking-wider">Participants</span>
                                <div className="flex items-center gap-2">
                                    {headerCollapsed.participants && (
                                        <span className={`text-[9px] font-medium ${isLightMode ? 'text-blue-700' : 'text-blue-300'}`}>
                                            {room.participants.length} Watching
                                        </span>
                                    )}
                                    {headerCollapsed.participants ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </div>
                            </button>
                            {!headerCollapsed.participants && (
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="flex -space-x-2 overflow-visible py-1 pl-0.5">
                                            {room.participants.map((participant, index) => {
                                                const tooltipPositionClass =
                                                    index <= 1
                                                        ? 'left-0 translate-x-0'
                                                        : index >= room.participants.length - 1
                                                            ? 'right-0 left-auto translate-x-0'
                                                            : 'left-1/2 -translate-x-1/2';

                                                return (
                                                    <div
                                                        key={participant.id}
                                                        className={`group relative inline-block h-8 w-8 rounded-full shadow-lg ${isLightMode ? 'ring-2 ring-white' : 'ring-2 ring-black'}`}
                                                        style={{
                                                            backgroundColor: participant.avatarColor,
                                                            zIndex: participant.role === 'host' ? 80 : 20 + index
                                                        }}
                                                    >
                                                        <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
                                                            {participant.username[0].toUpperCase()}
                                                        </span>
                                                        <span
                                                            className={`pointer-events-none absolute -top-8 z-[90] ${tooltipPositionClass} max-w-[172px] overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-black/25 bg-black/85 px-2 py-1 text-[9px] font-semibold text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100`}
                                                        >
                                                            {participant.role === 'host' ? `${participant.username} 👑 Host` : participant.username}
                                                        </span>
                                                        {participant.role === 'host' && (
                                                            <div className="absolute -right-1 -top-1 z-[85] rounded-full border border-black bg-yellow-500 p-0.5 shadow-md">
                                                                <Crown size={8} className="text-black" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <Users size={12} className="text-blue-500" />
                                                <span className={`text-[11px] font-bold ${isLightMode ? 'text-slate-700' : 'text-gray-200'}`}>{room.participants.length} Watching</span>
                                            </div>
                                            <span className="ml-4 text-[9px] font-medium text-gray-500">Syncing {isHost ? 'as Host' : 'with Host'}</span>
                                            <span className="ml-4 text-[9px] font-medium text-gray-500">Profile: {syncProfileLabel(syncProfileSetting)}</span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setUiTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}
                                            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-1.5 text-[9px] font-semibold transition-colors ${isLightMode
                                                ? 'border-blue-300/80 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                                : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:text-blue-200'
                                                }`}
                                            title={isLightMode ? 'Switch to dark mode (cinema / Netflix)' : 'Switch to light mode (work / YouTube)'}
                                            aria-label={isLightMode ? 'Enable dark mode' : 'Enable light mode'}
                                        >
                                            <span className={`relative inline-flex h-5 w-9 rounded-full ${isLightMode ? 'bg-blue-500/80' : 'bg-white/15'}`}>
                                                <span
                                                    className={`absolute top-[2px] h-4 w-4 rounded-full shadow transition-transform ${isLightMode ? 'translate-x-[17px] bg-white' : 'translate-x-[2px] bg-gray-300'
                                                        }`}
                                                />
                                            </span>
                                            {isLightMode ? <Sun size={11} /> : <Moon size={11} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowViewerSyncEvents((previous) => !previous)}
                                            className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${showViewerSyncEvents
                                                ? 'border-orange-400/40 bg-orange-500/15 text-orange-300'
                                                : isLightMode
                                                    ? 'border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-400 hover:text-orange-400'
                                                    : 'border-white/10 bg-white/5 text-gray-500 hover:border-white/20 hover:text-orange-300'
                                                }`}
                                            title={showViewerSyncEvents ? 'Hide user sync alerts in chat' : 'Show user sync alerts in chat'}
                                            aria-label={showViewerSyncEvents ? 'Hide user sync alerts' : 'Show user sync alerts'}
                                        >
                                            <AlertTriangle size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Volume Boost — available to all users */}
                        <div className={`mt-3 rounded-xl px-3 py-2 ${isLightMode ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/5'}`}>
                            <div className="flex items-center justify-between">
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>
                                    <Volume2 size={10} className="mr-1 inline-block -mt-0.5" />
                                    Volume Boost
                                </span>
                                <span className={`text-[9px] font-bold ${volumeBoost > 100
                                    ? (isLightMode ? 'text-orange-600' : 'text-orange-400')
                                    : (isLightMode ? 'text-blue-700' : 'text-blue-300')
                                    }`}>
                                    {volumeBoost}%
                                </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <VolumeX size={10} className={`shrink-0 ${isLightMode ? 'text-slate-400' : 'text-gray-500'}`} />
                                <input
                                    type="range"
                                    min={0}
                                    max={600}
                                    step={5}
                                    value={volumeBoost}
                                    onChange={(e) => handleVolumeBoostInput(Number(e.target.value))}
                                    onDoubleClick={() => {
                                        handleVolumeBoostInput(100);
                                        onSetVolumeBoost(100);
                                    }}
                                    onMouseUp={handleVolumeBoostCommit}
                                    onTouchEnd={handleVolumeBoostCommit}
                                    onKeyUp={handleVolumeBoostCommit}
                                    className={`h-1 flex-1 cursor-pointer appearance-none rounded-full ${isLightMode ? 'bg-slate-300 accent-orange-600' : 'bg-white/20 accent-orange-500'}`}
                                />
                                <Volume2 size={10} className={`shrink-0 ${isLightMode ? 'text-slate-400' : 'text-gray-500'}`} />
                            </div>
                            <div className={`mt-1 text-[8px] font-medium ${isLightMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                Double-click to reset to 100%. Local setting only.
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        <Chat
                            room={room}
                            username={username}
                            incomingMessage={latestMessage}
                            messageHistory={messageHistory}
                            messageHistoryRoomId={messageHistoryRoomId}
                            onSendChat={onSendChat}
                            soundsEnabled={chatSoundsEnabled}
                            showViewerSyncEvents={showViewerSyncEvents}
                            theme={uiTheme}
                        />
                    </div>
                </div>
            </div>
            <CreditsModal open={showCredits} onClose={() => setShowCredits(false)} />

            {/* Close Confirmation Modal */}
            {showCloseConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className={`mx-4 w-full max-w-sm rounded-xl border p-6 shadow-2xl ${isLightMode ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#1a1a1a]'}`}>
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                                <Power size={20} className="text-red-500" />
                            </div>
                            <h3 className={`text-lg font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                                Close Extension?
                            </h3>
                        </div>
                        <p className={`mb-6 text-sm ${isLightMode ? 'text-slate-600' : 'text-gray-400'}`}>
                            Are you sure you want to close the extension? This will leave the room and terminate the session.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCloseConfirm(false)}
                                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${isLightMode ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowCloseConfirm(false);
                                    handleCloseExtension();
                                }}
                                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
