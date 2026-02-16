import { io, Socket } from 'socket.io-client';
import { Platform, Room, SyncProfile, WSMessage, WSMessageSchema } from '@watch-party/shared';

const DEFAULT_SERVER_URL = 'https://watch-pizza-party.onrender.com';
const SERVER_URL_STORAGE_KEY = 'watchparty_server_url';
const SESSION_STORAGE_KEY_BASE = 'watchparty_active_session';
const LEGACY_SESSION_STORAGE_KEY = SESSION_STORAGE_KEY_BASE;
const SESSION_STORAGE_KEY = `${SESSION_STORAGE_KEY_BASE}_${chrome.extension.inIncognitoContext ? 'incognito' : 'regular'}`;
const SESSION_RESTORE_MAX_AGE_MS = 1000 * 60 * 60 * 8;

const VOLUME_BOOST_STORAGE_KEY = 'watchparty_volume_boost';
const DEFAULT_VOLUME_BOOST = 100; // percentage (100 = no boost)

const DEFAULT_SYNC_AGGRESSION = 50;
const DEFAULT_SYNC_PROFILE: SyncProfile = 'other';
const PLAYING_SNAPSHOT_MIN_INTERVAL_MS = 320;
const PAUSED_SNAPSHOT_MIN_INTERVAL_MS = 2200;
const HEARTBEAT_FALLBACK_MS = 1800;
const NETFLIX_PLAYPAUSE_COOLDOWN_MS = 280;
const NETFLIX_BACKWARD_SAMPLE_TOLERANCE_SECONDS = 0.85;
const SEEK_FASTLANE_DUPLICATE_MS = 1400;
const SEEK_FASTLANE_DUPLICATE_WINDOW_SECONDS = 1.4;
const SEEK_INTENT_SUPPRESS_MS = 850;
const VIEWER_OVERRIDE_RECOVERY_COOLDOWN_MS = 450;
const MAX_SYNC_TELEMETRY_EVENTS = 200;
const PANEL_PORT_STALE_MS = 8000;

type EffectiveSyncProfile = 'youtube' | 'netflix' | 'other';
type SyncProfileModifiers = {
    hardToleranceMultiplier: number;
    softTriggerMultiplier: number;
    hardCooldownMultiplier: number;
    softCooldownMultiplier: number;
    intentToleranceMultiplier: number;
    nudgeMultiplier: number;
};
type SyncProfileRuntimeStrategy = {
    seekJumpCooldownMs: number;
    seekSettleMs: number;
    seekHoldToleranceSeconds: number;
    followPlaybackDelayMs: number;
    netflixSeekSettleMs: number;
    netflixSeekCooldownMs: number;
    netflixSeekJumpCooldownMs: number;
    netflixDriftSeekThresholdSeconds: number;
    netflixPostSeekPlaybackDelayMs: number;
    netflixIntentSettleMaxDelayMs: number;
};
type LastSyncDispatch = {
    at: number;
    type: string;
    time?: number;
    isPlaying?: boolean;
    force?: boolean;
};

type PreferredMediaFrameState = {
    frameId: number;
    score: number;
    updatedAt: number;
};

const SYNC_PROFILE_MODIFIERS: Record<EffectiveSyncProfile, SyncProfileModifiers> = {
    youtube: {
        hardToleranceMultiplier: 1,
        softTriggerMultiplier: 1,
        hardCooldownMultiplier: 1,
        softCooldownMultiplier: 1,
        intentToleranceMultiplier: 1,
        nudgeMultiplier: 1
    },
    netflix: {
        hardToleranceMultiplier: 1.08,
        softTriggerMultiplier: 1.12,
        hardCooldownMultiplier: 1.12,
        softCooldownMultiplier: 1.15,
        intentToleranceMultiplier: 1.08,
        nudgeMultiplier: 0.9
    },
    other: {
        hardToleranceMultiplier: 1,
        softTriggerMultiplier: 1,
        hardCooldownMultiplier: 1,
        softCooldownMultiplier: 1,
        intentToleranceMultiplier: 1,
        nudgeMultiplier: 1
    }
};

const SYNC_PROFILE_RUNTIME: Record<EffectiveSyncProfile, SyncProfileRuntimeStrategy> = {
    youtube: {
        seekJumpCooldownMs: 720,
        seekSettleMs: 980,
        seekHoldToleranceSeconds: 1.15,
        followPlaybackDelayMs: 70,
        netflixSeekSettleMs: 1700,
        netflixSeekCooldownMs: 2300,
        netflixSeekJumpCooldownMs: 820,
        netflixDriftSeekThresholdSeconds: 2,
        netflixPostSeekPlaybackDelayMs: 110,
        netflixIntentSettleMaxDelayMs: 420
    },
    netflix: {
        seekJumpCooldownMs: 920,
        seekSettleMs: 1750,
        seekHoldToleranceSeconds: 2,
        followPlaybackDelayMs: 160,
        netflixSeekSettleMs: 1850,
        netflixSeekCooldownMs: 2500,
        netflixSeekJumpCooldownMs: 960,
        netflixDriftSeekThresholdSeconds: 2.25,
        netflixPostSeekPlaybackDelayMs: 150,
        netflixIntentSettleMaxDelayMs: 460
    },
    other: {
        seekJumpCooldownMs: 980,
        seekSettleMs: 1300,
        seekHoldToleranceSeconds: 1.6,
        followPlaybackDelayMs: 120,
        netflixSeekSettleMs: 1800,
        netflixSeekCooldownMs: 2600,
        netflixSeekJumpCooldownMs: 920,
        netflixDriftSeekThresholdSeconds: 2.4,
        netflixPostSeekPlaybackDelayMs: 140,
        netflixIntentSettleMaxDelayMs: 480
    }
};

type SyncTelemetryEvent = {
    at: number;
    roomId: string | null;
    category: 'decision' | 'command' | 'status' | 'snapshot';
    event: string;
    profile: EffectiveSyncProfile;
    platform: Platform;
    seq?: number;
    driftSeconds?: number;
    playMismatch?: boolean;
    details?: string;
};

type LocalStateReason =
    | 'initial'
    | 'play'
    | 'pause'
    | 'seek'
    | 'tick'
    | 'navigation'
    | 'ad_start'
    | 'ad_end';

type LocalStateMessage = {
    type: 'LOCAL_STATE';
    reason: LocalStateReason;
    url: string;
    title?: string;
    mediaId?: string;
    platform?: Platform;
    time: number;
    isPlaying: boolean;
    playbackRate?: number;
    inAd?: boolean;
    mediaScore?: number;
    frameUrl?: string;
};

type HostSnapshotPayload = {
    seq: number;
    mediaId: string;
    url: string;
    title?: string;
    platform: Platform;
    syncProfile: SyncProfile;
    timeSeconds: number;
    isPlaying: boolean;
    playbackRate: number;
    inAd: boolean;
    syncAggression: number;
    capturedAt: number;
    username?: string;
};

type StoredSession = {
    roomId: string;
    username: string;
    mediaTabId: number | null;
    syncAggression: number;
    syncProfile: SyncProfile;
    savedAt?: number;
};

type RoomCreationMedia = {
    url: string;
    title?: string;
    platform?: Platform;
    syncProfile?: SyncProfile;
    timeSeconds?: number;
    isPlaying?: boolean;
};

type CreateRoomPayload = {
    hostUsername?: string;
    initialMedia?: RoomCreationMedia;
};

type CreateRoomResponse = {
    roomId: string;
    hostId: string;
    username: string;
    joinLink?: string;
};

type PanelPortState = {
    tabId: number | null;
    lastSeenAt: number;
};

type SessionState = {
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
};

type PublicSessionState = SessionState & {
    isHost: boolean;
    volumeBoost: number;
};

type SyncTuning = {
    hardToleranceSeconds: number;
    softTriggerSeconds: number;
    hardCooldownMs: number;
    softCooldownMs: number;
    intentToleranceSeconds: number;
    nudgePercent: number;
};

const session: SessionState = {
    active: false,
    roomId: null,
    username: null,
    mediaTabId: null,
    room: null,
    meUserId: null,
    connected: false,
    lastError: null,
    syncAggression: DEFAULT_SYNC_AGGRESSION,
    syncProfile: DEFAULT_SYNC_PROFILE
};

let socket: Socket | null = null;
let hasRestoredFromStorage = false;

let hostSnapshotSeq = 0;
let latestHostSnapshot: HostSnapshotPayload | null = null;
let latestSyncState = { time: 0, isPlaying: false };
let lastHostSnapshotEmitAt = 0;
let lastViewerAutoSyncAt = 0;
let lastViewerSyncRef = { time: -1, isPlaying: false, at: 0 };
let recentRedirectRef = { normalizedUrl: '', at: 0 };
let viewerInitialSyncDone = false;
let lastViewerRoomUrl = '';
let lastViewerPlaybackIntent = { isPlaying: false, timeSeconds: -1, at: 0 };
let lastViewerNetflixSeekAt = 0;
let lastViewerNetflixPlayPauseAt = 0;
let lastViewerFastSeekSyncAt = 0;
let lastViewerFastSeekTargetSeconds = -1;
let lastViewerOverrideRecoverAt = 0;
let pendingViewerNetflixIntentTimer: number | null = null;
let lastViewerSeenHostSnapshot:
    | { seq: number; timeSeconds: number; capturedAt: number; url: string }
    | null = null;
let lastViewerAppliedHostActionSeq = 0;
let lastViewerHandledNavigateSeq = 0;

let hostHeartbeatTimer: number | null = null;
let viewerStatusTimer: number | null = null;
let viewerPostSyncTimer: number | null = null;
let floatingWidgetTimer: number | null = null;
const minimizedTabs = new Set<number>();
const dismissedWidgetTabs = new Set<number>();
const panelPorts = new Map<chrome.runtime.Port, PanelPortState>();
let joinTimeoutTimer: number | null = null;
let unreadChatCount = 0;
let floatingWidgetActionEmoji: string | null = null;
let floatingWidgetActionEmojiExpiresAt = 0;
const roomTimelineHistory = new Map<string, WSMessage[]>();
const MAX_ROOM_TIMELINE_MESSAGES = 220;
const syncTelemetry: SyncTelemetryEvent[] = [];
const lastSyncDispatchByTab = new Map<number, LastSyncDispatch>();
const preferredMediaFrameByTab = new Map<number, PreferredMediaFrameState>();
let lastHostNavigationBroadcast = { normalizedUrl: '', at: 0 };
let volumeBoostPercent: number = DEFAULT_VOLUME_BOOST;
let volumeBoostCaptureTabId: number | null = null;
let volumeBoostOffscreenActive = false;
let serverBaseUrl = DEFAULT_SERVER_URL;

// ── Volume Boost: tabCapture + offscreen document ──

async function ensureOffscreenDocument() {
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType]
        });
        if (existingContexts.length > 0) return;
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Volume boost audio processing'
        });
        volumeBoostOffscreenActive = true;
    } catch (err) {
        console.error('[WatchParty] Failed to create offscreen document:', err);
    }
}

async function closeOffscreenDocument() {
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType]
        });
        if (existingContexts.length > 0) {
            await chrome.offscreen.closeDocument();
        }
    } catch { /* ignore */ }
    volumeBoostOffscreenActive = false;
}

async function startVolumeBoostCapture(tabId: number, retryCount = 0) {
    try {
        // Verify tab still exists and is valid
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab || !tab.id) {
            console.warn('[WatchParty] Cannot start volume boost: tab no longer exists');
            return;
        }

        // CRITICAL: tabCapture requires the tab to be active/focused
        // We activate the tab silently - the user will see the media tab briefly
        await chrome.tabs.update(tabId, { active: true });

        // Small delay to ensure tab activation completes
        await new Promise(resolve => setTimeout(resolve, 100));

        await ensureOffscreenDocument();

        const streamId = await (chrome.tabCapture.getMediaStreamId as (options: { targetTabId: number }) => Promise<string>)({
            targetTabId: tabId
        });

        console.log('[WatchParty] Volume boost: Got stream ID, sending to offscreen doc');

        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'OFFSCREEN_START_CAPTURE',
            streamId,
            gain: volumeBoostPercent / 100
        }, () => { void chrome.runtime.lastError; });

        volumeBoostCaptureTabId = tabId;
    } catch (err) {
        console.error('[WatchParty] Failed to start volume boost capture (attempt ' + (retryCount + 1) + '):', err);

        // Retry once after a delay if this was the first attempt
        if (retryCount === 0) {
            setTimeout(() => {
                void startVolumeBoostCapture(tabId, retryCount + 1);
            }, 500);
        }
    }
}

function updateVolumeBoostGain(gain: number) {
    chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'OFFSCREEN_SET_GAIN',
        gain
    }, () => { void chrome.runtime.lastError; });
}

async function stopVolumeBoostCapture() {
    if (volumeBoostOffscreenActive) {
        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'OFFSCREEN_STOP_CAPTURE'
        }, () => { void chrome.runtime.lastError; });
    }
    volumeBoostCaptureTabId = null;
    await closeOffscreenDocument();
}

function appendRoomTimelineMessage(roomId: string | null | undefined, msg: WSMessage) {
    if (!roomId) return;
    if (msg.type !== 'chat.message' && msg.type !== 'sync.system_event') return;

    const history = roomTimelineHistory.get(roomId) ?? [];
    history.push(msg);
    if (history.length > MAX_ROOM_TIMELINE_MESSAGES) {
        history.splice(0, history.length - MAX_ROOM_TIMELINE_MESSAGES);
    }
    roomTimelineHistory.set(roomId, history);
}

function getRoomTimelineMessages(roomId: string | null | undefined): WSMessage[] {
    if (!roomId) return [];
    return [...(roomTimelineHistory.get(roomId) ?? [])];
}

function clearRoomTimelineMessages(roomId: string | null | undefined) {
    if (!roomId) return;
    roomTimelineHistory.delete(roomId);
}

function normalizeServerBaseUrl(raw: unknown): string {
    if (typeof raw !== 'string') return DEFAULT_SERVER_URL;
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_SERVER_URL;

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('Invalid server URL. Use http:// or https://');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Server URL must start with http:// or https://');
    }

    const normalizedPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${normalizedPath}`;
}

function getServerBaseUrl(): string {
    return serverBaseUrl;
}

function isLocalServerBaseUrl(baseUrl: string): boolean {
    try {
        const parsed = new URL(baseUrl);
        const hostname = parsed.hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
    } catch {
        return false;
    }
}

function getRoomCreateUrls(): string[] {
    const preferredBaseUrl = getServerBaseUrl();
    const urls = [`${preferredBaseUrl}/rooms`];
    if (isLocalServerBaseUrl(preferredBaseUrl)) {
        urls.push(`${DEFAULT_SERVER_URL}/rooms`, 'http://localhost:3005/rooms');
    }
    const deduped: string[] = [];
    for (const url of urls) {
        if (!deduped.includes(url)) {
            deduped.push(url);
        }
    }
    return deduped;
}

async function persistServerBaseUrl() {
    await chrome.storage.local.set({ [SERVER_URL_STORAGE_KEY]: getServerBaseUrl() });
}

async function restoreServerBaseUrl() {
    const stored = await chrome.storage.local.get([SERVER_URL_STORAGE_KEY]);
    const saved = stored[SERVER_URL_STORAGE_KEY];
    if (typeof saved !== 'string' || !saved.trim()) {
        serverBaseUrl = DEFAULT_SERVER_URL;
        return;
    }

    try {
        serverBaseUrl = normalizeServerBaseUrl(saved);
    } catch {
        serverBaseUrl = DEFAULT_SERVER_URL;
        await persistServerBaseUrl();
    }
}

async function setServerBaseUrl(raw: unknown): Promise<string> {
    const normalized = normalizeServerBaseUrl(raw);
    if (normalized === getServerBaseUrl()) {
        return normalized;
    }

    serverBaseUrl = normalized;
    await persistServerBaseUrl();

    const shouldReconnect = Boolean(socket || session.active);
    if (shouldReconnect) {
        disconnectSocket();
        if (session.active) {
            connectSocketIfNeeded();
        }
        broadcastSessionState();
    }

    return normalized;
}

function clampSyncAggression(raw: number | null | undefined): number {
    if (!Number.isFinite(raw)) return DEFAULT_SYNC_AGGRESSION;
    return Math.max(0, Math.min(100, Number(raw)));
}

function clampPlaybackRate(raw: number | null | undefined): number {
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0.25, Math.min(4, Number(raw)));
}

function isSyncProfile(value: unknown): value is SyncProfile {
    return value === 'youtube' || value === 'netflix' || value === 'other';
}

function clampSyncProfile(raw: unknown): SyncProfile {
    if (isSyncProfile(raw)) return raw;
    return DEFAULT_SYNC_PROFILE;
}

function profileFromPlatform(platform: Platform | undefined): SyncProfile {
    if (platform === 'youtube') return 'youtube';
    if (platform === 'netflix') return 'netflix';
    return 'other';
}

function resolveEffectiveSyncProfile(
    roomProfile: SyncProfile | undefined,
    platformHint: Platform | undefined
): SyncProfile {
    const profile = clampSyncProfile(roomProfile);
    if (profile === 'youtube' || profile === 'netflix') return profile;
    return profileFromPlatform(platformHint);
}

function toEffectiveSyncProfile(
    roomProfile: SyncProfile | undefined,
    platformHint: Platform | undefined
): EffectiveSyncProfile {
    const effective = resolveEffectiveSyncProfile(roomProfile, platformHint);
    if (effective === 'youtube' || effective === 'netflix' || effective === 'other') {
        return effective;
    }
    return 'other';
}

function getRuntimeSyncStrategy(profile: EffectiveSyncProfile): SyncProfileRuntimeStrategy {
    return SYNC_PROFILE_RUNTIME[profile];
}

function normalizeMediaScore(raw: unknown, fallbackState: LocalStateMessage): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(0, Math.min(10, raw));
    }

    let score = 0.2;
    if (fallbackState.platform === 'youtube' || fallbackState.platform === 'netflix') {
        score += 0.9;
    }
    if (fallbackState.isPlaying) {
        score += 1.0;
    }
    if (fallbackState.time > 0.2) {
        score += 0.35;
    }
    if (fallbackState.inAd) {
        score -= 0.5;
    }
    return Math.max(0, Math.min(10, score));
}

function getPreferredMediaFrame(tabId: number): PreferredMediaFrameState | undefined {
    const current = preferredMediaFrameByTab.get(tabId);
    if (!current) return undefined;
    if (Date.now() - current.updatedAt > 15000) {
        preferredMediaFrameByTab.delete(tabId);
        return undefined;
    }
    return current;
}

function getPreferredMediaFrameId(tabId: number): number | undefined {
    return getPreferredMediaFrame(tabId)?.frameId;
}

function clearPreferredMediaFrame(tabId: number | null | undefined) {
    if (typeof tabId !== 'number') return;
    preferredMediaFrameByTab.delete(tabId);
}

function updatePreferredMediaFrameFromLocalState(
    tabId: number,
    frameId: number,
    message: LocalStateMessage
): PreferredMediaFrameState {
    const now = Date.now();
    const score = normalizeMediaScore(message.mediaScore, message);
    const current = getPreferredMediaFrame(tabId);

    if (!current) {
        const next = { frameId, score, updatedAt: now };
        preferredMediaFrameByTab.set(tabId, next);
        return next;
    }

    if (current.frameId === frameId) {
        const next = {
            frameId,
            score: current.score * 0.58 + score * 0.42,
            updatedAt: now
        };
        preferredMediaFrameByTab.set(tabId, next);
        return next;
    }

    const currentStale = now - current.updatedAt > 3500;
    const muchBetter = score > current.score + 0.65;
    const significantlyBetter = score > current.score * 1.25;
    const candidateIsLikelyPrimary = message.isPlaying && score >= 1.2;

    if (currentStale || muchBetter || significantlyBetter || candidateIsLikelyPrimary) {
        const next = { frameId, score, updatedAt: now };
        preferredMediaFrameByTab.set(tabId, next);
        return next;
    }

    return current;
}

function appendSyncTelemetry(event: Omit<SyncTelemetryEvent, 'at' | 'roomId'>) {
    syncTelemetry.push({
        at: Date.now(),
        roomId: session.roomId,
        ...event
    });
    if (syncTelemetry.length > MAX_SYNC_TELEMETRY_EVENTS) {
        syncTelemetry.splice(0, syncTelemetry.length - MAX_SYNC_TELEMETRY_EVENTS);
    }
}

function sendSyncCommand(
    tabId: number,
    message: Record<string, unknown>,
    meta: {
        profile: EffectiveSyncProfile;
        platform: Platform;
        frameId?: number;
        seq?: number;
        driftSeconds?: number;
        playMismatch?: boolean;
        details?: string;
    }
) {
    const now = Date.now();
    const runtime = getRuntimeSyncStrategy(meta.profile);
    const isIntentCommand = Boolean(meta.details && meta.details.includes('intent'));
    const dedupeEnabled = !isIntentCommand;
    const youtubeRelaxed = meta.profile === 'youtube';
    const seekRepeatWindowMs = youtubeRelaxed ? 750 : Math.max(900, runtime.seekSettleMs - 120);
    const seekRepeatDeltaSeconds = youtubeRelaxed ? 0.45 : Math.max(0.45, Math.min(0.95, runtime.seekHoldToleranceSeconds * 0.36));
    const syncAllRepeatWindowMs = youtubeRelaxed ? 650 : Math.max(900, runtime.seekJumpCooldownMs);
    const syncAllRepeatDeltaSeconds = youtubeRelaxed ? 0.55 : Math.max(0.6, Math.min(1.05, runtime.seekHoldToleranceSeconds * 0.4));
    const commandType = String(message.type || 'unknown');
    const commandTime = typeof message.time === 'number' ? message.time : undefined;
    const commandIsPlaying = typeof message.isPlaying === 'boolean' ? message.isPlaying : undefined;
    const commandForce = Boolean((message as { force?: unknown }).force);
    const previousCommand = lastSyncDispatchByTab.get(tabId);

    if (previousCommand && dedupeEnabled) {
        const elapsedMs = now - previousCommand.at;
        let duplicate = false;
        let duplicateReason = '';

        if (commandType === previousCommand.type) {
            if ((commandType === 'SYNC_PLAY' || commandType === 'SYNC_PAUSE') && elapsedMs < 320) {
                duplicate = true;
                duplicateReason = 'play_pause_repeat';
            } else if (
                commandType === 'SYNC_SEEK' &&
                typeof commandTime === 'number' &&
                typeof previousCommand.time === 'number' &&
                elapsedMs < seekRepeatWindowMs &&
                Math.abs(commandTime - previousCommand.time) < seekRepeatDeltaSeconds
            ) {
                duplicate = true;
                duplicateReason = 'seek_repeat';
            } else if (
                commandType === 'SYNC_ALL' &&
                typeof commandTime === 'number' &&
                typeof previousCommand.time === 'number' &&
                commandIsPlaying === previousCommand.isPlaying
            ) {
                if (
                    !commandForce &&
                    elapsedMs < syncAllRepeatWindowMs &&
                    Math.abs(commandTime - previousCommand.time) < syncAllRepeatDeltaSeconds
                ) {
                    duplicate = true;
                    duplicateReason = 'sync_all_repeat';
                } else if (commandForce && elapsedMs < 280 && Math.abs(commandTime - previousCommand.time) < 0.25) {
                    duplicate = true;
                    duplicateReason = 'sync_all_force_repeat';
                }
            }
        } else if (
            commandType === 'SYNC_ALL' &&
            previousCommand.type === 'SYNC_SEEK' &&
            !commandForce &&
            typeof commandTime === 'number' &&
            typeof previousCommand.time === 'number' &&
            elapsedMs < 480 &&
            Math.abs(commandTime - previousCommand.time) < 0.35
        ) {
            duplicate = true;
            duplicateReason = 'sync_all_after_seek_repeat';
        }

        if (duplicate) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_duplicate_command',
                profile: meta.profile,
                platform: meta.platform,
                seq: meta.seq,
                driftSeconds: meta.driftSeconds,
                playMismatch: meta.playMismatch,
                details: duplicateReason
            });
            return;
        }
    }

    sendTabMessageWithRetry(tabId, message, 3, 120, meta.frameId);
    lastSyncDispatchByTab.set(tabId, {
        at: now,
        type: commandType,
        time: commandTime,
        isPlaying: commandIsPlaying,
        force: commandForce
    });
    appendSyncTelemetry({
        category: 'command',
        event: commandType,
        profile: meta.profile,
        platform: meta.platform,
        seq: meta.seq,
        driftSeconds: meta.driftSeconds,
        playMismatch: meta.playMismatch,
        details: meta.details
    });
}

function isPlatform(value: unknown): value is Platform {
    return value === 'youtube' || value === 'netflix' || value === 'unknown';
}

function sanitizeInitialMedia(raw: unknown): RoomCreationMedia | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const source = raw as Record<string, unknown>;
    if (typeof source.url !== 'string' || !source.url) return undefined;

    return {
        url: source.url,
        title: typeof source.title === 'string' ? source.title : undefined,
        platform: isPlatform(source.platform) ? source.platform : undefined,
        syncProfile: isSyncProfile(source.syncProfile) ? source.syncProfile : undefined,
        timeSeconds: typeof source.timeSeconds === 'number' ? source.timeSeconds : undefined,
        isPlaying: typeof source.isPlaying === 'boolean' ? source.isPlaying : undefined
    };
}

async function createRoomOnServer(payload: CreateRoomPayload): Promise<CreateRoomResponse> {
    let lastError: Error | null = null;
    let isAbortError = false;

    for (const url of getRoomCreateUrls()) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = (body as { error?: unknown }).error;
                throw new Error(typeof message === 'string' ? message : `Server Error (${response.status})`);
            }

            const roomId = (body as { roomId?: unknown }).roomId;
            const hostId = (body as { hostId?: unknown }).hostId;
            const username = (body as { username?: unknown }).username;
            const joinLink = (body as { joinLink?: unknown }).joinLink;

            if (typeof roomId !== 'string' || typeof hostId !== 'string' || typeof username !== 'string') {
                throw new Error('Invalid server response while creating room');
            }

            return {
                roomId,
                hostId,
                username,
                joinLink: typeof joinLink === 'string' ? joinLink : undefined
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Detect abort errors (timeout or network issues during server cold start)
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
                isAbortError = true;
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // If it was an abort/timeout error, provide a friendly message about server starting
    if (isAbortError && !isLocalServerBaseUrl(getServerBaseUrl())) {
        throw new Error('🍕 Pizza Server is starting up (takes ~30 sec). Please wait a moment and try again!');
    }

    throw lastError || new Error(`Cannot connect to server (${getServerBaseUrl()}).`);
}

async function pingServer(baseUrl: string, timeoutMs = 2200): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(baseUrl, {
            method: 'GET',
            signal: controller.signal
        });
        return response.status > 0;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function ensureReachableServerForSession() {
    const preferredBaseUrl = getServerBaseUrl();
    const preferredReachable = await pingServer(preferredBaseUrl);
    if (preferredReachable) return;
    if (!isLocalServerBaseUrl(preferredBaseUrl)) {
        return;
    }

    const fallbackCandidates = [DEFAULT_SERVER_URL, 'http://localhost:3005'];
    for (const fallbackBaseUrl of fallbackCandidates) {
        if (fallbackBaseUrl === preferredBaseUrl) continue;
        const fallbackReachable = await pingServer(fallbackBaseUrl);
        if (!fallbackReachable) continue;

        serverBaseUrl = fallbackBaseUrl;
        await persistServerBaseUrl();
        return;
    }
}

function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

function getSyncTuning(
    syncAggression: number | null | undefined,
    syncProfile: SyncProfile | undefined,
    platformHint: Platform | undefined
): SyncTuning {
    const normalized = clampSyncAggression(syncAggression) / 100;
    const effectiveProfile = toEffectiveSyncProfile(syncProfile, platformHint);
    const modifiers = SYNC_PROFILE_MODIFIERS[effectiveProfile];

    let driftTolerance: number;
    let softTrigger: number;
    let hardCooldown: number;
    let softCooldown: number;
    let intentTolerance: number;
    let nudge: number;

    if (effectiveProfile === 'youtube') {
        // Keep YouTube very responsive: frequent small corrections.
        driftTolerance = lerp(0.95, 0.22, normalized);
        softTrigger = driftTolerance * 0.42;
        hardCooldown = lerp(1050, 230, normalized);
        softCooldown = lerp(420, 120, normalized);
        intentTolerance = driftTolerance * 0.7;
        nudge = lerp(0.01, 0.032, normalized);
    } else if (effectiveProfile === 'netflix') {
        // Netflix still needs guardrails, but not multi-second lag.
        driftTolerance = lerp(1.8, 0.55, normalized);
        softTrigger = driftTolerance * 0.42;
        hardCooldown = lerp(2200, 620, normalized);
        softCooldown = lerp(920, 280, normalized);
        intentTolerance = driftTolerance * 0.72;
        nudge = lerp(0.0045, 0.02, normalized);
    } else {
        driftTolerance = lerp(2.4, 0.7, normalized);
        softTrigger = driftTolerance * 0.4;
        hardCooldown = lerp(2600, 700, normalized);
        softCooldown = lerp(980, 260, normalized);
        intentTolerance = driftTolerance * 0.68;
        nudge = lerp(0.004, 0.022, normalized);
    }

    return {
        hardToleranceSeconds: Math.max(0.25, driftTolerance * modifiers.hardToleranceMultiplier),
        softTriggerSeconds: Math.max(0.14, softTrigger * modifiers.softTriggerMultiplier),
        hardCooldownMs: Math.round(Math.max(220, hardCooldown * modifiers.hardCooldownMultiplier)),
        softCooldownMs: Math.round(Math.max(120, softCooldown * modifiers.softCooldownMultiplier)),
        intentToleranceSeconds: Math.max(0.2, intentTolerance * modifiers.intentToleranceMultiplier),
        nudgePercent: Math.max(0.002, Math.min(0.03, nudge * modifiers.nudgeMultiplier))
    };
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

function detectPlatform(rawUrl?: string): Platform {
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

function extractMediaId(normalizedUrl: string, platform: Platform): string {
    try {
        const parsed = new URL(normalizedUrl);
        if (platform === 'youtube') {
            if (parsed.hostname === 'youtu.be') {
                return parsed.pathname.replace('/', '') || normalizedUrl;
            }
            const videoId = parsed.searchParams.get('v');
            return videoId || normalizedUrl;
        }

        if (platform === 'netflix') {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const watchIndex = parts.indexOf('watch');
            if (watchIndex !== -1 && parts[watchIndex + 1]) {
                return parts[watchIndex + 1];
            }
        }
    } catch {
        return normalizedUrl;
    }

    return normalizedUrl;
}

function projectSnapshotTime(snapshot: HostSnapshotPayload): number {
    if (!snapshot.isPlaying || snapshot.inAd) return snapshot.timeSeconds;
    const elapsed = Math.max(0, (Date.now() - snapshot.capturedAt) / 1000);
    return snapshot.timeSeconds + elapsed * snapshot.playbackRate;
}

function getProjectedReferenceTime(room: Pick<Room, 'referenceTimeSeconds' | 'referenceUpdatedAt' | 'isPlaying'>): number {
    if (!room.isPlaying) return room.referenceTimeSeconds;
    const elapsedSeconds = Math.max(0, (Date.now() - room.referenceUpdatedAt) / 1000);
    return room.referenceTimeSeconds + elapsedSeconds;
}

function toPublicSessionState(): PublicSessionState {
    return {
        ...session,
        isHost: isHost(),
        volumeBoost: volumeBoostPercent
    };
}

function broadcastRuntimeMessage(message: unknown) {
    try {
        chrome.runtime.sendMessage(message, () => {
            void chrome.runtime.lastError;
        });
    } catch {
        // No active listeners.
    }
}

function broadcastSessionState() {
    broadcastRuntimeMessage({
        type: 'WATCHPARTY_SESSION_STATE',
        payload: toPublicSessionState()
    });
    void pushFloatingWidgetStatus();
}

function broadcastWSMessage(msg: WSMessage) {
    broadcastRuntimeMessage({
        type: 'WATCHPARTY_WS_MESSAGE',
        payload: msg
    });
}

function pruneStalePanelPorts() {
    const now = Date.now();
    for (const [port, state] of panelPorts.entries()) {
        // Panel heartbeat is every 3s, so this is roughly 2-3 missed beats.
        // Keeping this low makes bubble restore deterministic when panel closes.
        if (now - state.lastSeenAt > PANEL_PORT_STALE_MS) {
            panelPorts.delete(port);
        }
    }
}

function isPanelOpenForTab(tabId: number | null): boolean {
    if (!tabId) return false;
    pruneStalePanelPorts();
    for (const state of panelPorts.values()) {
        if (state.tabId === tabId) return true;
    }
    return false;
}

function clearUnreadChat() {
    unreadChatCount = 0;
}

function clearFloatingWidgetActionEmoji() {
    floatingWidgetActionEmoji = null;
    floatingWidgetActionEmojiExpiresAt = 0;
}

function getViewerRequestEmoji(reason: string | null | undefined): string {
    if (reason === 'control-back') return '⏪';
    if (reason === 'control-pause') return '⏸️';
    if (reason === 'control-play') return '▶️';
    if (reason === 'control-forward') return '⏩';
    return '🔄';
}

function getFloatingWidgetStatusPayload(requestTabId?: number | null) {
    const tabId = typeof requestTabId === 'number' ? requestTabId : session.mediaTabId;
    const panelOpen = isPanelOpenForTab(tabId);
    const widgetDismissed = Boolean(tabId && dismissedWidgetTabs.has(tabId));
    const now = Date.now();
    const actionEmojiVisible = Boolean(floatingWidgetActionEmoji && floatingWidgetActionEmojiExpiresAt > now);
    // Show fallback bubble on any web tab while session is active, except where
    // user dismissed it or panel is currently open for that tab.
    const showWidget = session.active && !panelOpen && !widgetDismissed;
    return {
        active: session.active,
        show: showWidget,
        participants: session.room?.participants.length ?? 0,
        unread: unreadChatCount,
        roomId: session.roomId,
        isHost: isHost(),
        connected: session.connected,
        requestEmoji: actionEmojiVisible ? floatingWidgetActionEmoji : null,
        requestEmojiExpiresAt: actionEmojiVisible ? floatingWidgetActionEmojiExpiresAt : null
    };
}

async function pushFloatingWidgetStatus() {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({}, (results) => {
            if (chrome.runtime.lastError || !Array.isArray(results)) {
                resolve([]);
                return;
            }
            resolve(results);
        });
    });

    for (const tab of tabs) {
        if (!tab.id || !isWebTabUrl(tab.url)) continue;
        await pushFloatingWidgetStatusToTab(tab.id);
    }
}

function resetSyncRefs() {
    hostSnapshotSeq = 0;
    latestHostSnapshot = null;
    latestSyncState = { time: 0, isPlaying: false };
    lastHostSnapshotEmitAt = 0;
    lastViewerAutoSyncAt = 0;
    lastViewerSyncRef = { time: -1, isPlaying: false, at: 0 };
    recentRedirectRef = { normalizedUrl: '', at: 0 };
    viewerInitialSyncDone = false;
    lastViewerRoomUrl = '';
    lastViewerPlaybackIntent = { isPlaying: false, timeSeconds: -1, at: 0 };
    lastViewerNetflixSeekAt = 0;
    lastViewerNetflixPlayPauseAt = 0;
    lastViewerFastSeekSyncAt = 0;
    lastViewerFastSeekTargetSeconds = -1;
    lastViewerOverrideRecoverAt = 0;
    if (pendingViewerNetflixIntentTimer !== null) {
        clearTimeout(pendingViewerNetflixIntentTimer);
        pendingViewerNetflixIntentTimer = null;
    }
    lastViewerSeenHostSnapshot = null;
    lastViewerAppliedHostActionSeq = 0;
    lastViewerHandledNavigateSeq = 0;
    lastSyncDispatchByTab.clear();
    preferredMediaFrameByTab.clear();
    lastHostNavigationBroadcast = { normalizedUrl: '', at: 0 };
}

function stopLoops() {
    if (hostHeartbeatTimer !== null) {
        clearInterval(hostHeartbeatTimer);
        hostHeartbeatTimer = null;
    }
    if (viewerStatusTimer !== null) {
        clearInterval(viewerStatusTimer);
        viewerStatusTimer = null;
    }
    if (viewerPostSyncTimer !== null) {
        clearTimeout(viewerPostSyncTimer);
        viewerPostSyncTimer = null;
    }
    if (joinTimeoutTimer !== null) {
        clearTimeout(joinTimeoutTimer);
        joinTimeoutTimer = null;
    }
    if (floatingWidgetTimer !== null) {
        clearInterval(floatingWidgetTimer);
        floatingWidgetTimer = null;
    }
    if (pendingViewerNetflixIntentTimer !== null) {
        clearTimeout(pendingViewerNetflixIntentTimer);
        pendingViewerNetflixIntentTimer = null;
    }
}

async function persistSession() {
    if (!session.active || !session.roomId || !session.username) {
        await chrome.storage.local.remove([SESSION_STORAGE_KEY, LEGACY_SESSION_STORAGE_KEY]);
        return;
    }

    const stored: StoredSession = {
        roomId: session.roomId,
        username: session.username,
        mediaTabId: session.mediaTabId,
        syncAggression: session.syncAggression,
        syncProfile: session.syncProfile,
        savedAt: Date.now()
    };
    await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: stored });
    if (SESSION_STORAGE_KEY !== LEGACY_SESSION_STORAGE_KEY) {
        await chrome.storage.local.remove(LEGACY_SESSION_STORAGE_KEY);
    }
}

async function safeSendToTab(tabId: number, message: Record<string, unknown>) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch {
        // Content script may not be available on this page.
    }
}

async function sendMessageToTab<T = unknown>(
    tabId: number,
    message: Record<string, unknown>,
    frameId?: number
): Promise<T | null> {
    return await new Promise((resolve) => {
        const callback = (response?: unknown) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            resolve((response ?? null) as T | null);
        };

        if (typeof frameId === 'number') {
            chrome.tabs.sendMessage(tabId, message, { frameId }, callback);
        } else {
            chrome.tabs.sendMessage(tabId, message, callback);
        }
    });
}

function isHost(): boolean {
    if (!session.room || !session.meUserId) return false;
    return session.room.hostId === session.meUserId;
}

function updateLatestSyncStateFromRoom() {
    if (latestHostSnapshot) {
        latestSyncState = {
            time: projectSnapshotTime(latestHostSnapshot),
            isPlaying: latestHostSnapshot.isPlaying
        };
        return;
    }

    if (!session.room) {
        latestSyncState = { time: 0, isPlaying: false };
        return;
    }

    latestSyncState = {
        time: getProjectedReferenceTime(session.room),
        isPlaying: session.room.isPlaying
    };
}

function connectSocketIfNeeded() {
    if (socket) return;

    socket = io(getServerBaseUrl(), {
        transports: ['websocket'],
        forceNew: true,
        reconnectionAttempts: Infinity
    });

    socket.on('connect', () => {
        session.connected = true;
        session.lastError = null;
        broadcastSessionState();

        if (session.active && session.roomId) {
            socket?.emit('message', {
                type: 'room.join',
                payload: {
                    roomId: session.roomId,
                    username: session.username || undefined
                }
            });
        }
    });

    socket.on('disconnect', () => {
        session.connected = false;
        broadcastSessionState();
    });

    socket.on('connect_error', (error) => {
        session.connected = false;
        session.lastError = `Server unreachable (${error.message || 'connect_error'})`;

        if (session.active && !session.room) {
            const previousRoomId = session.roomId;
            const preservedError = session.lastError;
            stopLoops();
            disconnectSocket();
            session.active = false;
            session.roomId = null;
            session.username = null;
            session.mediaTabId = null;
            session.room = null;
            session.meUserId = null;
            session.syncProfile = DEFAULT_SYNC_PROFILE;
            session.lastError = preservedError;
            clearUnreadChat();
            clearFloatingWidgetActionEmoji();
            clearRoomTimelineMessages(previousRoomId);
            resetSyncRefs();
            void persistSession();
        }
        broadcastSessionState();
    });

    socket.on('message', (raw: unknown) => {
        const parsed = WSMessageSchema.safeParse(raw);
        if (!parsed.success) {
            return;
        }

        const msg = parsed.data;
        handleServerMessage(msg);
    });
}

function disconnectSocket() {
    if (!socket) return;

    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    session.connected = false;
}

function refreshRoleLoops() {
    if (!session.active || !session.room) {
        stopLoops();
        return;
    }

    if (floatingWidgetTimer === null) {
        floatingWidgetTimer = setInterval(() => {
            void pushFloatingWidgetStatus();
        }, 1600);
    }

    if (isHost()) {
        if (viewerStatusTimer !== null) {
            clearInterval(viewerStatusTimer);
            viewerStatusTimer = null;
        }

        if (hostHeartbeatTimer !== null) return;
        hostHeartbeatTimer = setInterval(() => {
            void requestAndEmitHostSnapshot(false, 'heartbeat');
        }, HEARTBEAT_FALLBACK_MS);
        return;
    }

    if (hostHeartbeatTimer !== null) {
        clearInterval(hostHeartbeatTimer);
        hostHeartbeatTimer = null;
    }

    if (viewerStatusTimer !== null) return;
    viewerStatusTimer = setInterval(() => {
        void reportViewerStatus();
    }, 2200);

    void reportViewerStatus();
}

function maybeUpdateIdentityFromRoom() {
    if (!session.room || !session.username) return;

    const meById = session.meUserId
        ? session.room.participants.find((participant) => participant.id === session.meUserId)
        : null;
    if (meById) return;

    const meByName = session.room.participants.find((participant) => participant.username === session.username);
    if (meByName) {
        session.meUserId = meByName.id;
    }
}

async function getTabById(tabId: number): Promise<chrome.tabs.Tab | null> {
    return await new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab?.id) {
                resolve(null);
                return;
            }
            resolve(tab);
        });
    });
}

async function getActiveTabInCurrentWindow(): Promise<chrome.tabs.Tab | null> {
    return await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab?.id) {
                resolve(null);
                return;
            }
            resolve(activeTab);
        });
    });
}

async function updateTabUrl(tabId: number, url: string): Promise<chrome.tabs.Tab | null> {
    return await new Promise((resolve) => {
        chrome.tabs.update(tabId, { url }, (updatedTab) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            resolve(updatedTab || null);
        });
    });
}

async function waitMs(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function isWebTabUrl(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\//i.test(url);
}

async function pingContentScriptInTab(tabId: number): Promise<boolean> {
    return await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'WATCHPARTY_PING' }, (response?: { ok?: boolean }) => {
            if (chrome.runtime.lastError) {
                resolve(false);
                return;
            }
            resolve(Boolean(response?.ok));
        });
    });
}

async function ensureContentScriptBridgeInTab(tabId: number): Promise<boolean> {
    const MAX_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const ready = await pingContentScriptInTab(tabId);
        if (ready) return true;
        if (attempt < MAX_ATTEMPTS - 1) {
            await waitMs(140);
        }
    }
    return false;
}

async function pushFloatingWidgetStatusToTab(tabId: number): Promise<void> {
    await safeSendToTab(tabId, {
        type: 'WATCHPARTY_FLOAT_STATUS',
        ...getFloatingWidgetStatusPayload(tabId)
    });
}

async function ensureFloatingWidgetBridgeForTab(tabId: number, tabUrl?: string | null): Promise<void> {
    if (!session.active) return;
    const resolvedUrl = tabUrl ?? (await getTabById(tabId))?.url ?? null;
    if (!isWebTabUrl(resolvedUrl)) return;

    const ready = await ensureContentScriptBridgeInTab(tabId);
    if (!ready) return;
    await pushFloatingWidgetStatusToTab(tabId);
}

async function hydrateFloatingWidgetAcrossOpenTabs(): Promise<void> {
    if (!session.active) return;
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({}, (results) => {
            if (chrome.runtime.lastError || !Array.isArray(results)) {
                resolve([]);
                return;
            }
            resolve(results);
        });
    });

    for (const tab of tabs) {
        if (!tab.id || !isWebTabUrl(tab.url)) continue;
        await ensureFloatingWidgetBridgeForTab(tab.id, tab.url);
    }
}

async function requestTabMediaState(tabId: number, frameId?: number): Promise<LocalStateMessage | null> {
    return await new Promise((resolve) => {
        const callback = (response?: LocalStateMessage) => {
            if (chrome.runtime.lastError || !response || response.type !== 'LOCAL_STATE') {
                resolve(null);
                return;
            }
            resolve(response);
        };

        if (typeof frameId === 'number') {
            chrome.tabs.sendMessage(tabId, { type: 'GET_MEDIA_STATE' }, { frameId }, callback);
        } else {
            chrome.tabs.sendMessage(tabId, { type: 'GET_MEDIA_STATE' }, callback);
        }
    });
}

async function getTabMediaState(tabId: number, frameId?: number): Promise<LocalStateMessage | null> {
    const firstTry = await requestTabMediaState(tabId, frameId);
    if (firstTry) return firstTry;

    const ready = await ensureContentScriptBridgeInTab(tabId);
    if (!ready) return null;

    const secondTry = await requestTabMediaState(tabId, frameId);
    if (secondTry) return secondTry;
    if (typeof frameId === 'number') {
        return await requestTabMediaState(tabId);
    }
    return null;
}

function sendTabMessageWithRetry(
    tabId: number,
    message: Record<string, unknown>,
    retries = 8,
    delayMs = 350,
    frameId?: number
) {
    const sendAttempt = (attempt: number) => {
        const callback = () => {
            if (!chrome.runtime.lastError) return;
            if (attempt >= retries) return;

            setTimeout(() => {
                sendAttempt(attempt + 1);
            }, delayMs);
        };

        if (typeof frameId === 'number') {
            chrome.tabs.sendMessage(tabId, message, { frameId }, callback);
        } else {
            chrome.tabs.sendMessage(tabId, message, callback);
        }
    };

    sendAttempt(0);
}

async function ensureSessionTabId(): Promise<number | null> {
    if (session.mediaTabId) {
        const existing = await getTabById(session.mediaTabId);
        if (existing?.id) return existing.id;
        session.mediaTabId = null;
    }

    const activeTab = await getActiveTabInCurrentWindow();
    if (!activeTab?.id) return null;
    session.mediaTabId = activeTab.id;
    await persistSession();
    broadcastSessionState();
    return activeTab.id;
}

function emitHostSnapshot(mediaState: LocalStateMessage, force = false, source: 'event' | 'heartbeat' = 'event') {
    if (!socket || !session.active || !session.roomId || !isHost()) return;

    const normalizedUrl = normalizeWatchUrl(mediaState.url);
    if (!normalizedUrl) return;

    const platform = mediaState.platform || detectPlatform(normalizedUrl);
    const autoSyncProfile = profileFromPlatform(platform);
    if (session.syncProfile !== autoSyncProfile) {
        session.syncProfile = autoSyncProfile;
        if (session.room) {
            session.room.syncProfile = autoSyncProfile;
        }
        void persistSession();
        broadcastSessionState();
    }
    const previousSnapshot = latestHostSnapshot;
    const nextTimeSeconds = Math.max(0, mediaState.time);
    const nextIsPlaying = Boolean(mediaState.isPlaying);
    const nextPlaybackRate = clampPlaybackRate(mediaState.playbackRate ?? 1);
    const nextInAd = Boolean(mediaState.inAd);
    const nextMediaId = mediaState.mediaId || extractMediaId(normalizedUrl, platform);
    const nextSyncAggression = clampSyncAggression(session.syncAggression);
    const now = Date.now();

    if (!force && source === 'heartbeat' && now - lastHostSnapshotEmitAt < HEARTBEAT_FALLBACK_MS) {
        return;
    }

    if (
        !force &&
        platform === 'netflix' &&
        previousSnapshot &&
        previousSnapshot.platform === 'netflix' &&
        previousSnapshot.mediaId === nextMediaId &&
        nextIsPlaying &&
        previousSnapshot.isPlaying &&
        mediaState.reason !== 'seek' &&
        mediaState.reason !== 'navigation'
    ) {
        const backwardJump = previousSnapshot.timeSeconds - nextTimeSeconds;
        if (backwardJump > NETFLIX_BACKWARD_SAMPLE_TOLERANCE_SECONDS) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'host_snapshot_drop_backward_noise',
                profile: toEffectiveSyncProfile(session.syncProfile, platform),
                platform,
                details: `jump=${backwardJump.toFixed(2)}s`
            });
            return;
        }
    }

    if (!force && previousSnapshot) {
        const sameMedia =
            normalizeWatchUrl(previousSnapshot.url) === normalizedUrl &&
            previousSnapshot.mediaId === nextMediaId &&
            previousSnapshot.platform === platform;
        const samePlaybackMode =
            previousSnapshot.isPlaying === nextIsPlaying &&
            previousSnapshot.inAd === nextInAd &&
            Math.abs(previousSnapshot.playbackRate - nextPlaybackRate) < 0.02;
        const deltaSeconds = Math.abs(previousSnapshot.timeSeconds - nextTimeSeconds);
        const elapsedMs = Math.max(0, now - previousSnapshot.capturedAt);
        const minIntervalMs = nextIsPlaying ? PLAYING_SNAPSHOT_MIN_INTERVAL_MS : PAUSED_SNAPSHOT_MIN_INTERVAL_MS;
        const minDeltaSeconds = nextIsPlaying ? 0.35 : 0.08;

        if (sameMedia && samePlaybackMode && elapsedMs < minIntervalMs && deltaSeconds < minDeltaSeconds) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'host_snapshot_drop_min_interval',
                profile: toEffectiveSyncProfile(session.syncProfile, platform),
                platform,
                details: `delta=${deltaSeconds.toFixed(2)} elapsedMs=${elapsedMs}`
            });
            return;
        }
    }

    const snapshot: HostSnapshotPayload = {
        seq: hostSnapshotSeq + 1,
        mediaId: nextMediaId,
        url: normalizedUrl,
        title: mediaState.title,
        platform,
        syncProfile: autoSyncProfile,
        timeSeconds: nextTimeSeconds,
        isPlaying: nextIsPlaying,
        playbackRate: nextPlaybackRate,
        inAd: nextInAd,
        syncAggression: nextSyncAggression,
        capturedAt: now,
        username: session.username || undefined
    };

    hostSnapshotSeq = snapshot.seq;
    latestHostSnapshot = snapshot;
    lastHostSnapshotEmitAt = now;
    latestSyncState = {
        time: projectSnapshotTime(snapshot),
        isPlaying: snapshot.isPlaying
    };

    socket.emit('message', {
        type: force ? 'sync.force_snapshot' : 'sync.host_snapshot',
        payload: snapshot
    });
    appendSyncTelemetry({
        category: 'snapshot',
        event: force ? 'emit_force_snapshot' : 'emit_host_snapshot',
        profile: toEffectiveSyncProfile(snapshot.syncProfile, snapshot.platform),
        platform: snapshot.platform,
        seq: snapshot.seq
    });

    const mediaChanged =
        previousSnapshot !== null &&
        normalizeWatchUrl(previousSnapshot.url) !== normalizedUrl;
    if (mediaChanged) {
        socket.emit('message', {
            type: 'sync.navigate',
            payload: {
                seq: snapshot.seq,
                url: normalizedUrl,
                title: mediaState.title,
                platform,
                syncProfile: snapshot.syncProfile,
                timeSeconds: snapshot.timeSeconds,
                isPlaying: snapshot.isPlaying
            }
        });
    }

    socket.emit('message', {
        type: 'room.update_url',
        payload: {
            url: normalizedUrl,
            title: mediaState.title,
            platform,
            syncProfile: snapshot.syncProfile,
            timeSeconds: snapshot.timeSeconds,
            isPlaying: snapshot.isPlaying
        }
    });

    const playbackStateChanged = previousSnapshot !== null && previousSnapshot.isPlaying !== snapshot.isPlaying;

    if (playbackStateChanged && snapshot.isPlaying) {
        socket.emit('message', {
            type: 'sync.play_intent',
            payload: { timeSeconds: snapshot.timeSeconds, seq: snapshot.seq }
        });
    } else if (playbackStateChanged && !snapshot.isPlaying) {
        socket.emit('message', {
            type: 'sync.pause_intent',
            payload: { timeSeconds: snapshot.timeSeconds, seq: snapshot.seq }
        });
    } else if (mediaState.reason === 'seek') {
        socket.emit('message', {
            type: 'sync.set_reference_time',
            payload: { timeSeconds: snapshot.timeSeconds, source: 'seek', seq: snapshot.seq }
        });
    }

    if (force) {
        socket.emit('message', {
            type: 'sync.set_reference_time',
            payload: { timeSeconds: snapshot.timeSeconds, source: 'initial', seq: snapshot.seq }
        });
        socket.emit('message', {
            type: snapshot.isPlaying ? 'sync.play_intent' : 'sync.pause_intent',
            payload: { timeSeconds: snapshot.timeSeconds, seq: snapshot.seq }
        });
    }
}

async function requestAndEmitHostSnapshot(force = false, source: 'event' | 'heartbeat' = 'event') {
    if (!session.active || !isHost()) return;

    let mediaState: LocalStateMessage | null = null;
    const tabId = await ensureSessionTabId();
    if (tabId) {
        const preferredFrameId = getPreferredMediaFrameId(tabId);
        mediaState = await getTabMediaState(tabId, preferredFrameId);
    }

    if (!mediaState && session.room?.currentUrl) {
        mediaState = {
            type: 'LOCAL_STATE',
            reason: 'initial',
            url: session.room.currentUrl,
            title: session.room.currentTitle,
            platform: session.room.currentPlatform,
            time: getProjectedReferenceTime(session.room),
            isPlaying: session.room.isPlaying,
            playbackRate: 1,
            inAd: false,
            mediaScore: 0,
            frameUrl: session.room.currentUrl
        };
    }

    if (mediaState?.url) {
        emitHostSnapshot(mediaState, force, source);
    }
}

async function syncViewerWithLatest(tabId: number) {
    const hostSnapshot = latestHostSnapshot;
    const hostPlaybackRate = hostSnapshot?.playbackRate ?? 1;
    const effectiveProfile = toEffectiveSyncProfile(
        hostSnapshot?.syncProfile ?? session.syncProfile,
        hostSnapshot?.platform ?? session.room?.currentPlatform
    );
    const effectivePlatform = hostSnapshot?.platform ?? session.room?.currentPlatform ?? 'unknown';
    const tuning = getSyncTuning(
        hostSnapshot?.syncAggression,
        hostSnapshot?.syncProfile ?? session.syncProfile,
        hostSnapshot?.platform ?? session.room?.currentPlatform
    );
    const now = Date.now();
    const recentlySynced =
        now - lastViewerSyncRef.at < 500 &&
        Math.abs(lastViewerSyncRef.time - latestSyncState.time) < 0.35 &&
        lastViewerSyncRef.isPlaying === latestSyncState.isPlaying;

    if (recentlySynced) return;
    const preferredFrameId = getPreferredMediaFrameId(tabId);

    lastViewerSyncRef = {
        time: latestSyncState.time,
        isPlaying: latestSyncState.isPlaying,
        at: now
    };

    sendSyncCommand(tabId, {
        type: 'SYNC_ALL',
        time: latestSyncState.time,
        isPlaying: latestSyncState.isPlaying,
        playbackRate: hostPlaybackRate,
        nudgePercent: tuning.nudgePercent,
        toleranceSeconds: tuning.hardToleranceSeconds + 0.18,
        force: true
    }, {
        profile: effectiveProfile,
        platform: effectivePlatform,
        frameId: preferredFrameId,
        seq: hostSnapshot?.seq,
        details: 'syncViewerWithLatest:first-pass'
    });

    if (viewerPostSyncTimer !== null) {
        clearTimeout(viewerPostSyncTimer);
    }

    viewerPostSyncTimer = setTimeout(() => {
        sendSyncCommand(tabId, {
            type: 'SYNC_ALL',
            time: latestSyncState.time,
            isPlaying: latestSyncState.isPlaying,
            playbackRate: hostPlaybackRate,
            nudgePercent: tuning.nudgePercent,
            toleranceSeconds: tuning.hardToleranceSeconds + 0.18
        }, {
            profile: effectiveProfile,
            platform: effectivePlatform,
            frameId: preferredFrameId,
            seq: hostSnapshot?.seq,
            details: 'syncViewerWithLatest:post-pass'
        });
    }, 700);
}

async function ensureViewerAtRoomUrl(targetUrlOverride?: string) {
    if (!session.active || !session.room || isHost()) return;

    const targetUrl = targetUrlOverride || session.room.currentUrl;
    if (!targetUrl || !targetUrl.startsWith('http')) return;

    const normalizedTarget = normalizeWatchUrl(targetUrl);
    if (!normalizedTarget) return;

    const tabId = await ensureSessionTabId();
    if (!tabId) return;

    const tab = await getTabById(tabId);
    if (!tab?.id) return;

    const normalizedCurrent = normalizeWatchUrl(tab.url);
    const now = Date.now();
    const redirectedRecently = !targetUrlOverride &&
        recentRedirectRef.normalizedUrl === normalizedTarget &&
        now - recentRedirectRef.at < 5000;

    if (normalizedCurrent !== normalizedTarget && !redirectedRecently) {
        clearPreferredMediaFrame(tabId);
        recentRedirectRef = { normalizedUrl: normalizedTarget, at: now };
        const result = await updateTabUrl(tabId, normalizedTarget);

        if (!result) {
            await new Promise(r => setTimeout(r, 500));
            await updateTabUrl(tabId, normalizedTarget);
        }

        setTimeout(() => {
            void syncViewerWithLatest(tabId);
        }, 1800);
        return;
    }

    if (normalizedCurrent === normalizedTarget) {
        await syncViewerWithLatest(tabId);
    }
}

async function emitHostRoomUrlUpdateFromTab(tabId: number, incomingTab?: chrome.tabs.Tab | null) {
    if (!socket || !session.active || !session.roomId || !isHost() || session.mediaTabId !== tabId) return;

    const tab = incomingTab?.id ? incomingTab : await getTabById(tabId);
    const rawUrl = tab?.url;
    if (!rawUrl || !rawUrl.startsWith('http')) return;

    const normalizedUrl = normalizeWatchUrl(rawUrl);
    if (!normalizedUrl) return;

    const now = Date.now();
    const roomUrl = normalizeWatchUrl(session.room?.currentUrl);
    const alreadyKnown = normalizedUrl === roomUrl;
    const duplicateBroadcast =
        lastHostNavigationBroadcast.normalizedUrl === normalizedUrl &&
        now - lastHostNavigationBroadcast.at < 1800;
    if (alreadyKnown || duplicateBroadcast) return;
    clearPreferredMediaFrame(tabId);

    const navigationSeq = Math.max(hostSnapshotSeq + 1, (latestHostSnapshot?.seq ?? 0) + 1);
    hostSnapshotSeq = navigationSeq;
    lastHostNavigationBroadcast = { normalizedUrl, at: now };
    const platform = detectPlatform(normalizedUrl);
    const autoSyncProfile = profileFromPlatform(platform);
    if (session.syncProfile !== autoSyncProfile) {
        session.syncProfile = autoSyncProfile;
        void persistSession();
    }
    const title = tab?.title || session.room?.currentTitle || undefined;

    socket.emit('message', {
        type: 'sync.navigate',
        payload: {
            seq: navigationSeq,
            url: normalizedUrl,
            title,
            platform,
            syncProfile: autoSyncProfile,
            timeSeconds: 0,
            isPlaying: false
        }
    });

    if (session.room) {
        session.room.currentUrl = normalizedUrl;
        session.room.currentTitle = title;
        session.room.currentPlatform = platform;
        session.room.syncProfile = autoSyncProfile;
        session.room.referenceTimeSeconds = 0;
        session.room.referenceUpdatedAt = now;
        session.room.isPlaying = false;
    }
    latestSyncState = { time: 0, isPlaying: false };
    broadcastSessionState();

    setTimeout(() => {
        void requestAndEmitHostSnapshot(true, 'event');
    }, 650);
}

async function reportViewerStatus() {
    if (!socket || !session.active || !session.room || isHost()) return;

    const tabId = await ensureSessionTabId();
    if (!tabId) return;

    const preferredFrameId = getPreferredMediaFrameId(tabId);
    const mediaState = await getTabMediaState(tabId, preferredFrameId);
    if (!mediaState) return;

    const hostState = latestSyncState;
    const driftSeconds = mediaState.time - hostState.time;
    const blockedByAd = Boolean(mediaState.inAd);
    const state = blockedByAd
        ? 'ad'
        : mediaState.isPlaying
            ? 'playing'
            : 'paused';

    socket.emit('message', {
        type: 'sync.viewer_status',
        payload: {
            appliedSeq: latestHostSnapshot?.seq ?? hostSnapshotSeq,
            driftSeconds,
            blockedByAd,
            state
        }
    });
}

async function handleViewerSyncMessage(msg: WSMessage) {
    if (!session.active || isHost()) return;

    const tabId = await ensureSessionTabId();
    if (!tabId) return;

    const tab = await getTabById(tabId);
    if (!tab?.id) return;
    const viewerTabId = tab.id;
    const viewerFrameId = getPreferredMediaFrameId(viewerTabId);

    const normalizedActive = normalizeWatchUrl(tab.url);
    const viewerPlatform = detectPlatform(tab.url || '');
    const roomProfile = session.room?.syncProfile ?? session.syncProfile;
    const roomEffectiveProfile = toEffectiveSyncProfile(
        roomProfile,
        session.room?.currentPlatform ?? viewerPlatform
    );
    let effectiveProfile: EffectiveSyncProfile = roomEffectiveProfile;
    let runtimeStrategy = getRuntimeSyncStrategy(effectiveProfile);
    let effectivePlatform: Platform = session.room?.currentPlatform ?? viewerPlatform;
    let viewerIsNetflix = roomEffectiveProfile === 'netflix';

    if (msg.type === 'sync.host_snapshot' || msg.type === 'sync.force_snapshot') {
        const snapshot = msg.payload as HostSnapshotPayload;
        const previousSeq = lastViewerSeenHostSnapshot?.seq ?? 0;
        const seqLooksReset = previousSeq > 0 && snapshot.seq <= 2 && snapshot.seq < previousSeq;
        if (seqLooksReset) {
            lastViewerAppliedHostActionSeq = 0;
            lastViewerHandledNavigateSeq = 0;
            lastViewerSeenHostSnapshot = null;
        }
        if (!seqLooksReset && snapshot.seq <= previousSeq) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_stale_snapshot_seq',
                profile: toEffectiveSyncProfile(snapshot.syncProfile, snapshot.platform),
                platform: snapshot.platform,
                seq: snapshot.seq,
                details: `last=${previousSeq}`
            });
            return;
        }
        const snapshotEffectiveProfile = toEffectiveSyncProfile(snapshot.syncProfile ?? roomProfile, snapshot.platform);
        effectiveProfile = snapshotEffectiveProfile;
        runtimeStrategy = getRuntimeSyncStrategy(effectiveProfile);
        effectivePlatform = snapshot.platform;
        viewerIsNetflix = snapshotEffectiveProfile === 'netflix';
        const normalizedSnapshot = normalizeWatchUrl(snapshot.url);
        const previousViewerHostSnapshot = lastViewerSeenHostSnapshot;
        lastViewerSeenHostSnapshot = {
            seq: snapshot.seq,
            timeSeconds: snapshot.timeSeconds,
            capturedAt: snapshot.capturedAt,
            url: snapshot.url
        };

        if (normalizedActive && normalizedSnapshot && normalizedActive !== normalizedSnapshot) {
            void ensureViewerAtRoomUrl(snapshot.url);
            return;
        }

        if (normalizedActive && normalizedSnapshot && normalizedActive === normalizedSnapshot) {
            const projectedTime = projectSnapshotTime(snapshot);
            const isForceSync = msg.type === 'sync.force_snapshot';
            const tuning = getSyncTuning(snapshot.syncAggression, snapshot.syncProfile, snapshot.platform);
            const now = Date.now();
            const previousSnapshotUrl = previousViewerHostSnapshot ? normalizeWatchUrl(previousViewerHostSnapshot.url) : '';
            const hostLikelySeekJump = Boolean(
                !isForceSync &&
                previousViewerHostSnapshot &&
                snapshot.seq > previousViewerHostSnapshot.seq &&
                previousSnapshotUrl &&
                previousSnapshotUrl === normalizedSnapshot &&
                Math.abs(snapshot.timeSeconds - previousViewerHostSnapshot.timeSeconds) >= 1.6
            );
            let toleranceSeconds = tuning.hardToleranceSeconds;
            let viewerState: LocalStateMessage | null = null;

            if (!isForceSync) {
                viewerState = await getTabMediaState(viewerTabId, viewerFrameId);
                if (viewerState) {
                    const driftSeconds = Math.abs(viewerState.time - projectedTime);
                    const playMismatch = viewerState.isPlaying !== snapshot.isPlaying;
                    const recentIntentForSameState =
                        now - lastViewerPlaybackIntent.at < 1300 &&
                        lastViewerPlaybackIntent.isPlaying === snapshot.isPlaying &&
                        Math.abs(lastViewerPlaybackIntent.timeSeconds - projectedTime) < 1.25;
                    const fastSeekSettleActive =
                        now - lastViewerFastSeekSyncAt < runtimeStrategy.seekSettleMs &&
                        Math.abs(lastViewerFastSeekTargetSeconds - projectedTime) < 1.4;
                    const fastSeekHoldTolerance = Math.max(
                        runtimeStrategy.seekHoldToleranceSeconds,
                        tuning.hardToleranceSeconds
                    );

                    if (!isForceSync && fastSeekSettleActive && driftSeconds < fastSeekHoldTolerance) {
                        appendSyncTelemetry({
                            category: 'decision',
                            event: 'skip_fast_seek_settle',
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            seq: snapshot.seq,
                            driftSeconds,
                            playMismatch
                        });
                        return;
                    }

                    if (!playMismatch && driftSeconds < tuning.softTriggerSeconds) {
                        appendSyncTelemetry({
                            category: 'decision',
                            event: 'skip_within_soft_tolerance',
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            seq: snapshot.seq,
                            driftSeconds,
                            playMismatch
                        });
                        return;
                    }

                    if (playMismatch && recentIntentForSameState && driftSeconds < 1.3) {
                        appendSyncTelemetry({
                            category: 'decision',
                            event: 'skip_recent_intent_same_state',
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            seq: snapshot.seq,
                            driftSeconds,
                            playMismatch
                        });
                        return;
                    }

                    const requiredCooldownMs =
                        hostLikelySeekJump
                            ? runtimeStrategy.seekJumpCooldownMs
                            : playMismatch
                            ? 420
                            : driftSeconds >= tuning.hardToleranceSeconds
                                ? tuning.hardCooldownMs
                                : tuning.softCooldownMs;

                    if (now - lastViewerAutoSyncAt < requiredCooldownMs) {
                        appendSyncTelemetry({
                            category: 'decision',
                            event: 'skip_cooldown_active',
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            seq: snapshot.seq,
                            driftSeconds,
                            playMismatch,
                            details: `required=${requiredCooldownMs}`
                        });
                        return;
                    }

                    lastViewerAutoSyncAt = now;
                    toleranceSeconds =
                        hostLikelySeekJump
                            ? 0.45
                            : driftSeconds >= tuning.hardToleranceSeconds
                            ? tuning.hardToleranceSeconds
                            : tuning.hardToleranceSeconds + 0.35;
                }
            } else {
                lastViewerAutoSyncAt = Date.now();
            }

            if (!isForceSync && !viewerIsNetflix && hostLikelySeekJump) {
                sendSyncCommand(viewerTabId, { type: 'SYNC_SEEK', time: projectedTime }, {
                    profile: effectiveProfile,
                    platform: effectivePlatform,
                    frameId: viewerFrameId,
                    seq: snapshot.seq,
                    details: 'fastlane_seek_jump'
                });
                lastViewerFastSeekSyncAt = now;
                lastViewerFastSeekTargetSeconds = projectedTime;
                lastViewerAutoSyncAt = now;
                lastViewerPlaybackIntent = {
                    isPlaying: snapshot.isPlaying,
                    timeSeconds: projectedTime,
                    at: now
                };

                setTimeout(() => {
                    if (Date.now() - lastViewerFastSeekSyncAt > runtimeStrategy.seekSettleMs + 250) return;
                    if (effectiveProfile === 'youtube' && snapshot.isPlaying) return;
                    sendSyncCommand(viewerTabId, { type: snapshot.isPlaying ? 'SYNC_PLAY' : 'SYNC_PAUSE' }, {
                        profile: effectiveProfile,
                        platform: effectivePlatform,
                        frameId: viewerFrameId,
                        seq: snapshot.seq,
                        details: 'fastlane_follow_playback'
                    });
                    const appliedAt = Date.now();
                    lastViewerPlaybackIntent = {
                        isPlaying: snapshot.isPlaying,
                        timeSeconds: projectedTime,
                        at: appliedAt
                    };
                }, runtimeStrategy.followPlaybackDelayMs);
                return;
            }

            if (viewerIsNetflix) {
                if (!viewerState) {
                    viewerState = await getTabMediaState(viewerTabId, viewerFrameId);
                }

                const driftSeconds = viewerState ? Math.abs(viewerState.time - projectedTime) : Number.POSITIVE_INFINITY;
                const settleWindowActive = now - lastViewerNetflixSeekAt < runtimeStrategy.netflixSeekSettleMs;
                let didSeek = false;
                const hugeDrift = driftSeconds >= runtimeStrategy.netflixDriftSeekThresholdSeconds + 2.5;

                const shouldSeekBase =
                    isForceSync ||
                    hostLikelySeekJump ||
                    driftSeconds >= Math.max(tuning.hardToleranceSeconds, runtimeStrategy.netflixDriftSeekThresholdSeconds);
                const shouldSeek = shouldSeekBase && (!settleWindowActive || isForceSync || hostLikelySeekJump || hugeDrift);
                const seekCooldownMs =
                    isForceSync || hostLikelySeekJump
                        ? runtimeStrategy.netflixSeekJumpCooldownMs
                        : runtimeStrategy.netflixSeekCooldownMs;
                if (shouldSeek && now - lastViewerNetflixSeekAt >= seekCooldownMs) {
                    sendSyncCommand(viewerTabId, { type: 'SYNC_SEEK', time: projectedTime }, {
                        profile: effectiveProfile,
                        platform: effectivePlatform,
                        frameId: viewerFrameId,
                        seq: snapshot.seq,
                        driftSeconds,
                        details: 'netflix_snapshot_seek'
                    });
                    lastViewerNetflixSeekAt = now;
                    lastViewerAutoSyncAt = now;
                    lastViewerFastSeekSyncAt = now;
                    lastViewerFastSeekTargetSeconds = projectedTime;
                    didSeek = true;
                }

                // Netflix playback (play/pause) is managed primarily by explicit intents.
                // Snapshots only do timeline correction; apply one playback command on force/seek.
                if ((isForceSync || didSeek) && now - lastViewerNetflixPlayPauseAt >= NETFLIX_PLAYPAUSE_COOLDOWN_MS) {
                    if (pendingViewerNetflixIntentTimer !== null) {
                        clearTimeout(pendingViewerNetflixIntentTimer);
                        pendingViewerNetflixIntentTimer = null;
                    }
                    const playbackDelayMs = settleWindowActive
                        ? Math.min(
                            runtimeStrategy.netflixIntentSettleMaxDelayMs,
                            runtimeStrategy.netflixPostSeekPlaybackDelayMs + 180
                        )
                        : runtimeStrategy.netflixPostSeekPlaybackDelayMs;
                    pendingViewerNetflixIntentTimer = setTimeout(() => {
                        sendSyncCommand(viewerTabId, { type: snapshot.isPlaying ? 'SYNC_PLAY' : 'SYNC_PAUSE' }, {
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            frameId: viewerFrameId,
                            seq: snapshot.seq,
                            driftSeconds,
                            details: 'netflix_snapshot_follow_playback'
                        });
                        const appliedAt = Date.now();
                        lastViewerNetflixPlayPauseAt = appliedAt;
                        lastViewerPlaybackIntent = {
                            isPlaying: snapshot.isPlaying,
                            timeSeconds: projectedTime,
                            at: appliedAt
                        };
                        pendingViewerNetflixIntentTimer = null;
                    }, playbackDelayMs);
                }
                if (isForceSync && didSeek) {
                    setTimeout(() => {
                        sendSyncCommand(viewerTabId, { type: snapshot.isPlaying ? 'SYNC_PLAY' : 'SYNC_PAUSE' }, {
                            profile: effectiveProfile,
                            platform: effectivePlatform,
                            frameId: viewerFrameId,
                            seq: snapshot.seq,
                            driftSeconds,
                            details: 'netflix_force_post_seek_playback'
                        });
                        const appliedAt = Date.now();
                        lastViewerNetflixPlayPauseAt = appliedAt;
                        lastViewerPlaybackIntent = {
                            isPlaying: snapshot.isPlaying,
                            timeSeconds: projectedTime,
                            at: appliedAt
                        };
                    }, runtimeStrategy.netflixPostSeekPlaybackDelayMs + 80);
                }
                return;
            }

            const shouldForce = isForceSync;
            sendSyncCommand(viewerTabId, {
                type: 'SYNC_ALL',
                time: projectedTime,
                isPlaying: snapshot.isPlaying,
                playbackRate: snapshot.playbackRate,
                nudgePercent: tuning.nudgePercent,
                toleranceSeconds: shouldForce ? 0.15 : toleranceSeconds,
                force: shouldForce
            }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: snapshot.seq,
                details: shouldForce ? 'snapshot_force_sync_all' : 'snapshot_sync_all'
            });
            lastViewerPlaybackIntent = {
                isPlaying: snapshot.isPlaying,
                timeSeconds: projectedTime,
                at: now
            };
        }
        return;
    }

    const normalizedRoom = normalizeWatchUrl(session.room?.currentUrl);
    if (normalizedRoom && normalizedActive && normalizedRoom !== normalizedActive) {
        return;
    }

    if (msg.type === 'sync.play_intent') {
        const now = Date.now();
        // Explicit host action: bypass periodic-sync cooldown gates.
        lastViewerAutoSyncAt = 0;
        const explicitSeq = typeof msg.payload.seq === 'number' ? msg.payload.seq : undefined;
        const resolvedSeq = explicitSeq ?? latestHostSnapshot?.seq;
        if (typeof explicitSeq === 'number' && explicitSeq <= lastViewerAppliedHostActionSeq) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_play_intent_stale_seq',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: explicitSeq,
                details: `last=${lastViewerAppliedHostActionSeq}`
            });
            return;
        }
        if (typeof explicitSeq === 'number') {
            lastViewerAppliedHostActionSeq = Math.max(lastViewerAppliedHostActionSeq, explicitSeq);
        }
        if (now - lastViewerFastSeekSyncAt < SEEK_INTENT_SUPPRESS_MS) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_play_intent_seek_suppress',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: resolvedSeq
            });
            return;
        }
        const duplicateIntent =
            lastViewerPlaybackIntent.isPlaying === true &&
            now - lastViewerPlaybackIntent.at < 1100 &&
            Math.abs(lastViewerPlaybackIntent.timeSeconds - msg.payload.timeSeconds) < 0.9;
        if (duplicateIntent) return;

        if (viewerIsNetflix) {
            const inSeekSettle = now - lastViewerNetflixSeekAt < runtimeStrategy.netflixSeekSettleMs;
            const playPauseCooldown = now - lastViewerNetflixPlayPauseAt < NETFLIX_PLAYPAUSE_COOLDOWN_MS;
            if (playPauseCooldown) return;
            if (inSeekSettle) {
                const settleRemaining = Math.max(120, runtimeStrategy.netflixSeekSettleMs - (now - lastViewerNetflixSeekAt));
                setTimeout(() => {
                    sendSyncCommand(viewerTabId, { type: 'SYNC_PLAY' }, {
                        profile: effectiveProfile,
                        platform: effectivePlatform,
                        frameId: viewerFrameId,
                        seq: resolvedSeq,
                        details: 'play_intent_delayed_for_seek_settle'
                    });
                    lastViewerNetflixPlayPauseAt = Date.now();
                    lastViewerPlaybackIntent = {
                        isPlaying: true,
                        timeSeconds: msg.payload.timeSeconds,
                        at: Date.now()
                    };
                }, Math.min(settleRemaining, runtimeStrategy.netflixIntentSettleMaxDelayMs));
                return;
            }

            lastViewerPlaybackIntent = {
                isPlaying: true,
                timeSeconds: msg.payload.timeSeconds,
                at: now
            };
            lastViewerNetflixPlayPauseAt = now;
            sendSyncCommand(viewerTabId, { type: 'SYNC_PLAY' }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: resolvedSeq,
                details: 'play_intent_netflix'
            });
            return;
        }

        lastViewerPlaybackIntent = {
            isPlaying: true,
            timeSeconds: msg.payload.timeSeconds,
            at: now
        };

        sendSyncCommand(viewerTabId, { type: 'SYNC_PLAY' }, {
            profile: effectiveProfile,
            platform: effectivePlatform,
            frameId: viewerFrameId,
            seq: resolvedSeq,
            details: 'play_intent'
        });
        const viewerState = await getTabMediaState(viewerTabId, viewerFrameId);
        if (viewerState && Math.abs(viewerState.time - msg.payload.timeSeconds) > 1.35) {
            sendSyncCommand(viewerTabId, { type: 'SYNC_SEEK', time: msg.payload.timeSeconds }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: resolvedSeq,
                details: 'play_intent_follow_seek'
            });
        }
    } else if (msg.type === 'sync.pause_intent') {
        const now = Date.now();
        // Explicit host action: bypass periodic-sync cooldown gates.
        lastViewerAutoSyncAt = 0;
        const explicitSeq = typeof msg.payload.seq === 'number' ? msg.payload.seq : undefined;
        const resolvedSeq = explicitSeq ?? latestHostSnapshot?.seq;
        if (typeof explicitSeq === 'number' && explicitSeq <= lastViewerAppliedHostActionSeq) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_pause_intent_stale_seq',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: explicitSeq,
                details: `last=${lastViewerAppliedHostActionSeq}`
            });
            return;
        }
        if (typeof explicitSeq === 'number') {
            lastViewerAppliedHostActionSeq = Math.max(lastViewerAppliedHostActionSeq, explicitSeq);
        }
        if (now - lastViewerFastSeekSyncAt < SEEK_INTENT_SUPPRESS_MS) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_pause_intent_seek_suppress',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: resolvedSeq
            });
            return;
        }
        const duplicateIntent =
            lastViewerPlaybackIntent.isPlaying === false &&
            now - lastViewerPlaybackIntent.at < 1100 &&
            Math.abs(lastViewerPlaybackIntent.timeSeconds - msg.payload.timeSeconds) < 0.9;
        if (duplicateIntent) return;

        if (viewerIsNetflix) {
            const playPauseCooldown = now - lastViewerNetflixPlayPauseAt < NETFLIX_PLAYPAUSE_COOLDOWN_MS;
            if (playPauseCooldown && lastViewerPlaybackIntent.isPlaying === false) return;

            lastViewerPlaybackIntent = {
                isPlaying: false,
                timeSeconds: msg.payload.timeSeconds,
                at: now
            };
            lastViewerNetflixPlayPauseAt = now;
            sendSyncCommand(viewerTabId, { type: 'SYNC_PAUSE' }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: resolvedSeq,
                details: 'pause_intent_netflix'
            });
            return;
        }

        lastViewerPlaybackIntent = {
            isPlaying: false,
            timeSeconds: msg.payload.timeSeconds,
            at: now
        };

        sendSyncCommand(viewerTabId, { type: 'SYNC_PAUSE' }, {
            profile: effectiveProfile,
            platform: effectivePlatform,
            frameId: viewerFrameId,
            seq: resolvedSeq,
            details: 'pause_intent'
        });
        const viewerState = await getTabMediaState(viewerTabId, viewerFrameId);
        if (viewerState && Math.abs(viewerState.time - msg.payload.timeSeconds) > 0.85) {
            sendSyncCommand(viewerTabId, { type: 'SYNC_SEEK', time: msg.payload.timeSeconds }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: resolvedSeq,
                details: 'pause_intent_follow_seek'
            });
        }
    } else if (msg.type === 'sync.set_reference_time') {
        if (viewerIsNetflix) return;
        const now = Date.now();
        // Explicit host action: bypass periodic-sync cooldown gates.
        lastViewerAutoSyncAt = 0;
        const explicitSeq = typeof msg.payload.seq === 'number' ? msg.payload.seq : undefined;
        const resolvedSeq = explicitSeq ?? latestHostSnapshot?.seq;
        if (typeof explicitSeq === 'number' && explicitSeq <= lastViewerAppliedHostActionSeq) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_reference_stale_seq',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: explicitSeq,
                details: `last=${lastViewerAppliedHostActionSeq}`
            });
            return;
        }
        if (typeof explicitSeq === 'number') {
            lastViewerAppliedHostActionSeq = Math.max(lastViewerAppliedHostActionSeq, explicitSeq);
        }
        const isSeekReference = msg.payload.source === 'seek';
        if (isSeekReference) {
            const duplicateWindowMs = Math.max(SEEK_FASTLANE_DUPLICATE_MS, runtimeStrategy.seekSettleMs - 350);
            const duplicateSeek =
                now - lastViewerFastSeekSyncAt < duplicateWindowMs &&
                Math.abs(lastViewerFastSeekTargetSeconds - msg.payload.timeSeconds) < SEEK_FASTLANE_DUPLICATE_WINDOW_SECONDS;
            if (duplicateSeek) {
                appendSyncTelemetry({
                    category: 'decision',
                    event: 'skip_reference_duplicate_seek',
                    profile: effectiveProfile,
                    platform: effectivePlatform,
                    seq: resolvedSeq
                });
                return;
            }

            lastViewerFastSeekSyncAt = now;
            lastViewerFastSeekTargetSeconds = msg.payload.timeSeconds;
            lastViewerAutoSyncAt = now;

            sendSyncCommand(viewerTabId, { type: 'SYNC_SEEK', time: msg.payload.timeSeconds }, {
                profile: effectiveProfile,
                platform: effectivePlatform,
                frameId: viewerFrameId,
                seq: resolvedSeq,
                details: 'reference_seek'
            });
            setTimeout(() => {
                if (Date.now() - lastViewerFastSeekSyncAt > runtimeStrategy.seekSettleMs + 260) return;
                if (effectiveProfile === 'youtube' && latestSyncState.isPlaying) return;
                sendSyncCommand(viewerTabId, {
                    type: latestSyncState.isPlaying ? 'SYNC_PLAY' : 'SYNC_PAUSE'
                }, {
                    profile: effectiveProfile,
                    platform: effectivePlatform,
                    frameId: viewerFrameId,
                    seq: resolvedSeq,
                    details: 'reference_seek_follow_playback'
                });
            }, runtimeStrategy.followPlaybackDelayMs);
            lastViewerPlaybackIntent = {
                isPlaying: latestSyncState.isPlaying,
                timeSeconds: msg.payload.timeSeconds,
                at: now
            };
            return;
        }

        const tooSoonAfterAutoSync = now - lastViewerAutoSyncAt < 650;
        if (tooSoonAfterAutoSync) {
            appendSyncTelemetry({
                category: 'decision',
                event: 'skip_reference_too_soon_after_auto_sync',
                profile: effectiveProfile,
                platform: effectivePlatform,
                seq: resolvedSeq
            });
            return;
        }

        const tuning = getSyncTuning(
            latestHostSnapshot?.syncAggression,
            latestHostSnapshot?.syncProfile ?? session.syncProfile,
            latestHostSnapshot?.platform ?? session.room?.currentPlatform
        );
        sendSyncCommand(viewerTabId, {
            type: 'SYNC_ALL',
            time: msg.payload.timeSeconds,
            isPlaying: latestSyncState.isPlaying,
            playbackRate: 1,
            nudgePercent: tuning.nudgePercent,
            toleranceSeconds: 0.12,
            force: true
        }, {
            profile: effectiveProfile,
            platform: effectivePlatform,
            frameId: viewerFrameId,
            seq: resolvedSeq,
            details: 'reference_force_sync_all'
        });
    }
}

function handleServerMessage(msg: WSMessage) {
    const timelineRoomId = msg.type === 'chat.message' ? msg.payload.roomId : session.roomId;
    appendRoomTimelineMessage(timelineRoomId, msg);

    if (msg.type === 'room.state') {
        if (joinTimeoutTimer !== null) {
            clearTimeout(joinTimeoutTimer);
            joinTimeoutTimer = null;
        }
        const previousHostId = session.room?.hostId;
        session.room = msg.payload;
        session.syncProfile = clampSyncProfile(msg.payload.syncProfile);
        if (previousHostId && previousHostId !== msg.payload.hostId) {
            lastViewerAppliedHostActionSeq = 0;
            lastViewerHandledNavigateSeq = 0;
            lastViewerSeenHostSnapshot = null;
        }
        maybeUpdateIdentityFromRoom();
        updateLatestSyncStateFromRoom();
        refreshRoleLoops();
        broadcastSessionState();
        if (!isHost()) {
            const normalizedRoomUrl = normalizeWatchUrl(msg.payload.currentUrl);
            const roomUrlChanged = normalizedRoomUrl !== lastViewerRoomUrl;
            const shouldInitialSync = !viewerInitialSyncDone;

            lastViewerRoomUrl = normalizedRoomUrl;
            if (shouldInitialSync || roomUrlChanged) {
                viewerInitialSyncDone = true;
                void ensureViewerAtRoomUrl();
            }
        }
    } else if (msg.type === 'sync.navigate') {
        const navigateUrl = normalizeWatchUrl(msg.payload.url);
        const navigateSeq = typeof msg.payload.seq === 'number' ? msg.payload.seq : undefined;
        const shouldApplyViewerRedirect =
            !isHost() &&
            Boolean(navigateUrl) &&
            (typeof navigateSeq !== 'number' || navigateSeq > lastViewerHandledNavigateSeq);
        if (typeof navigateSeq === 'number') {
            lastViewerHandledNavigateSeq = Math.max(lastViewerHandledNavigateSeq, navigateSeq);
        }
        if (session.room) {
            session.room.currentUrl = msg.payload.url;
            session.room.currentTitle = msg.payload.title;
            if (msg.payload.platform) {
                session.room.currentPlatform = msg.payload.platform;
            }
            if (typeof msg.payload.syncProfile === 'string') {
                session.room.syncProfile = clampSyncProfile(msg.payload.syncProfile);
                session.syncProfile = session.room.syncProfile;
            }
            if (typeof msg.payload.timeSeconds === 'number') {
                session.room.referenceTimeSeconds = Math.max(0, msg.payload.timeSeconds);
            }
            if (typeof msg.payload.isPlaying === 'boolean') {
                session.room.isPlaying = msg.payload.isPlaying;
            }
            session.room.referenceUpdatedAt = Date.now();
        }

        latestSyncState = {
            time:
                typeof msg.payload.timeSeconds === 'number'
                    ? Math.max(0, msg.payload.timeSeconds)
                    : latestSyncState.time,
            isPlaying:
                typeof msg.payload.isPlaying === 'boolean'
                    ? msg.payload.isPlaying
                    : latestSyncState.isPlaying
        };
        broadcastSessionState();

        if (shouldApplyViewerRedirect && navigateUrl) {
            recentRedirectRef = { normalizedUrl: '', at: 0 };
            viewerInitialSyncDone = true;
            lastViewerRoomUrl = navigateUrl;
            void ensureViewerAtRoomUrl(msg.payload.url);
        }
    } else if (msg.type === 'sync.host_snapshot' || msg.type === 'sync.force_snapshot') {
        const snapshot = msg.payload as HostSnapshotPayload;
        latestHostSnapshot = snapshot;
        hostSnapshotSeq = Math.max(hostSnapshotSeq, snapshot.seq);
        latestSyncState = {
            time: projectSnapshotTime(snapshot),
            isPlaying: snapshot.isPlaying
        };

        if (session.room && snapshot.url) {
            const normalizedSnap = normalizeWatchUrl(snapshot.url);
            const normalizedRoom = normalizeWatchUrl(session.room.currentUrl);
            if (normalizedSnap && normalizedSnap !== normalizedRoom) {
                session.room.currentUrl = snapshot.url;
                session.room.currentPlatform = snapshot.platform;
                if (snapshot.syncProfile) {
                    session.room.syncProfile = clampSyncProfile(snapshot.syncProfile);
                }
            }
        }

        if (!isHost()) {
            if (msg.type === 'sync.force_snapshot') {
                recentRedirectRef = { normalizedUrl: '', at: 0 };
                void ensureViewerAtRoomUrl(snapshot.url);
            }
            void handleViewerSyncMessage(msg);
        }
    } else if (
        msg.type === 'sync.play_intent' ||
        msg.type === 'sync.pause_intent' ||
        msg.type === 'sync.set_reference_time'
    ) {
        if (!isHost()) {
            void handleViewerSyncMessage(msg);
        }
    } else if (msg.type === 'sync.viewer_request_sync') {
        floatingWidgetActionEmoji = getViewerRequestEmoji(msg.payload.reason);
        floatingWidgetActionEmojiExpiresAt = Date.now() + 10_000;
        void pushFloatingWidgetStatus();
    } else if (msg.type === 'chat.message') {
        const fromMe = msg.payload.username === session.username;
        const panelOpen = isPanelOpenForTab(session.mediaTabId);
        if (!fromMe && !panelOpen) {
            unreadChatCount = Math.min(999, unreadChatCount + 1);
            void pushFloatingWidgetStatus();
        }
    } else if (msg.type === 'error') {
        session.lastError = msg.payload.message;
        if (!session.room) {
            const previousRoomId = session.roomId;
            stopLoops();
            disconnectSocket();
            session.active = false;
            session.roomId = null;
            session.username = null;
            session.mediaTabId = null;
            session.meUserId = null;
            session.syncProfile = DEFAULT_SYNC_PROFILE;
            clearUnreadChat();
            clearFloatingWidgetActionEmoji();
            clearRoomTimelineMessages(previousRoomId);
            resetSyncRefs();
            void persistSession();
        }
        broadcastSessionState();
    }

    broadcastWSMessage(msg);
}

async function startSession(payload: {
    roomId: string;
    username: string;
    tabId?: number | null;
    syncAggression?: number | null;
    syncProfile?: SyncProfile | null;
}) {
    const roomId = payload.roomId.trim();
    const username = payload.username.trim();
    if (!roomId || !username) {
        throw new Error('roomId and username are required');
    }

    const previousRoomId = session.roomId;
    if (previousRoomId && previousRoomId !== roomId) {
        clearRoomTimelineMessages(previousRoomId);
    }

    if (!session.active || session.roomId !== roomId || session.username !== username) {
        resetSyncRefs();
    }

    clearUnreadChat();
    clearFloatingWidgetActionEmoji();
    session.active = true;
    session.roomId = roomId;
    session.username = username;
    session.lastError = null;
    session.room = null;
    session.meUserId = null;
    session.syncAggression = clampSyncAggression(payload.syncAggression ?? session.syncAggression);
    session.syncProfile = DEFAULT_SYNC_PROFILE;
    if (joinTimeoutTimer !== null) {
        clearTimeout(joinTimeoutTimer);
        joinTimeoutTimer = null;
    }

    if (typeof payload.tabId === 'number') {
        session.mediaTabId = payload.tabId;
        minimizedTabs.delete(payload.tabId);
        await safeSendToTab(payload.tabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
        await chrome.sidePanel.setOptions({ tabId: payload.tabId, enabled: true, path: 'index.html' });
        const tab = await getTabById(payload.tabId);
        if (tab?.url) {
            const platform = detectPlatform(tab.url);
            session.syncProfile = profileFromPlatform(platform);
        }
        // Start volume boost capture on the new media tab
        if (volumeBoostPercent !== DEFAULT_VOLUME_BOOST) {
            void startVolumeBoostCapture(payload.tabId);
        }
    }

    await persistSession();
    await ensureReachableServerForSession();
    connectSocketIfNeeded();

    joinTimeoutTimer = setTimeout(() => {
        if (!session.active || session.room) return;
        const preservedError = 'Could not join room (timeout). Check server and room code.';
        const previousRoomId = session.roomId;
        stopLoops();
        disconnectSocket();
        session.active = false;
        session.roomId = null;
        session.username = null;
        session.mediaTabId = null;
        session.room = null;
        session.meUserId = null;
        session.syncProfile = DEFAULT_SYNC_PROFILE;
        session.lastError = preservedError;
        clearUnreadChat();
        clearRoomTimelineMessages(previousRoomId);
        resetSyncRefs();
        void persistSession();
        broadcastSessionState();
    }, 12000);

    if (socket?.connected) {
        socket.emit('message', {
            type: 'room.join',
            payload: {
                roomId,
                username
            }
        });
    }

    broadcastSessionState();
}

async function leaveSession() {
    const previousRoomId = session.roomId;
    if (session.mediaTabId) {
        minimizedTabs.delete(session.mediaTabId);
        await safeSendToTab(session.mediaTabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
    }

    stopLoops();
    disconnectSocket();

    session.active = false;
    session.roomId = null;
    session.username = null;
    session.mediaTabId = null;
    session.room = null;
    session.meUserId = null;
    session.lastError = null;
    session.syncAggression = DEFAULT_SYNC_AGGRESSION;
    session.syncProfile = DEFAULT_SYNC_PROFILE;
    clearUnreadChat();
    clearFloatingWidgetActionEmoji();
    clearRoomTimelineMessages(previousRoomId);
    minimizedTabs.clear();
    dismissedWidgetTabs.clear();
    void stopVolumeBoostCapture();

    resetSyncRefs();
    await persistSession();
    broadcastSessionState();
}

async function handlePanelMinimize(tabId: number) {
    if (session.mediaTabId !== tabId) {
        if (session.mediaTabId) {
            clearPreferredMediaFrame(session.mediaTabId);
        }
        session.mediaTabId = tabId;
        clearPreferredMediaFrame(tabId);
        await persistSession();
    }

    minimizedTabs.add(tabId);
    dismissedWidgetTabs.delete(tabId);

    // Evict ALL panel ports — the user explicitly chose to minimize,
    // so no panel should be considered "open" anymore.
    // (window.close() doesn't work for Chrome side panels, and ports
    // may have null tabId, so we must clear everything.)
    for (const [port] of panelPorts.entries()) {
        panelPorts.delete(port);
        try { port.disconnect(); } catch { /* ignore */ }
    }

    await safeSendToTab(tabId, { type: 'WATCHPARTY_SHOW_FLOAT_BUBBLE' });
    setTimeout(() => {
        void safeSendToTab(tabId, { type: 'WATCHPARTY_SHOW_FLOAT_BUBBLE' });
    }, 120);
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
    void pushFloatingWidgetStatus();
}

async function handlePanelRestore(tabId: number) {
    const tabChanged = session.mediaTabId !== tabId;
    if (tabChanged) {
        if (session.mediaTabId) {
            clearPreferredMediaFrame(session.mediaTabId);
        }
        session.mediaTabId = tabId;
        clearPreferredMediaFrame(tabId);
        await persistSession();
    }

    minimizedTabs.delete(tabId);
    dismissedWidgetTabs.delete(tabId);
    await chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'index.html' });
    await chrome.sidePanel.open({ tabId });
    if (session.mediaTabId === tabId) {
        clearUnreadChat();
    }
    await safeSendToTab(tabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
    // Restart volume boost capture on the new tab when media tab changes
    if (tabChanged && volumeBoostPercent !== DEFAULT_VOLUME_BOOST) {
        void stopVolumeBoostCapture().then(() => startVolumeBoostCapture(tabId));
    }
    void pushFloatingWidgetStatus();
}

async function handleLocalStateMessage(message: LocalStateMessage, sender: chrome.runtime.MessageSender) {
    if (!session.active) return;

    const senderTabId = sender.tab?.id;
    if (!senderTabId) return;
    const senderFrameId = typeof sender.frameId === 'number' ? sender.frameId : 0;

    if (!session.mediaTabId) {
        session.mediaTabId = senderTabId;
        await persistSession();
        broadcastSessionState();
    }

    if (session.mediaTabId !== senderTabId) return;
    const preferredFrame = updatePreferredMediaFrameFromLocalState(senderTabId, senderFrameId, message);
    const isPreferredFrame = preferredFrame.frameId === senderFrameId;
    const isTopNavigationEvent = senderFrameId === 0 && message.reason === 'navigation';
    if (!isPreferredFrame && !isTopNavigationEvent) {
        return;
    }

    if (isHost()) {
        if (socket && session.active && session.roomId) {
            const immediateSeq = Math.max(hostSnapshotSeq + 1, (latestHostSnapshot?.seq ?? 0) + 1);
            if (message.reason === 'play') {
                socket.emit('message', {
                    type: 'sync.play_intent',
                    payload: { timeSeconds: Math.max(0, message.time), seq: immediateSeq }
                });
            } else if (message.reason === 'pause') {
                socket.emit('message', {
                    type: 'sync.pause_intent',
                    payload: { timeSeconds: Math.max(0, message.time), seq: immediateSeq }
                });
            } else if (message.reason === 'seek') {
                socket.emit('message', {
                    type: 'sync.set_reference_time',
                    payload: {
                        timeSeconds: Math.max(0, message.time),
                        source: 'seek',
                        seq: immediateSeq
                    }
                });
            }
        }

        const shouldForceSnapshot =
            message.reason === 'seek' ||
            message.reason === 'play' ||
            message.reason === 'pause';
        void requestAndEmitHostSnapshot(shouldForceSnapshot, 'event');
        return;
    }

    // Keep viewers in follower mode: if they manually diverge, re-apply host state quickly.
    if (message.reason === 'play' || message.reason === 'pause' || message.reason === 'seek') {
        const now = Date.now();
        const viewerPlatform = message.platform || detectPlatform(message.url);
        const resolvedProfile = toEffectiveSyncProfile(
            session.room?.syncProfile ?? session.syncProfile,
            session.room?.currentPlatform ?? viewerPlatform
        );
        const viewerIsNetflix = resolvedProfile === 'netflix';
        const driftSeconds = Math.abs(message.time - latestSyncState.time);
        const playMismatch = message.isPlaying !== latestSyncState.isPlaying;
        const viewerDivergenceThreshold = viewerIsNetflix ? 1.35 : resolvedProfile === 'youtube' ? 0.95 : 1.05;
        const viewerDiverged = playMismatch || driftSeconds >= viewerDivergenceThreshold;

        if (!viewerIsNetflix && viewerDiverged && now - lastViewerOverrideRecoverAt >= VIEWER_OVERRIDE_RECOVERY_COOLDOWN_MS) {
            lastViewerOverrideRecoverAt = now;
            lastViewerAutoSyncAt = now;
            const tuning = getSyncTuning(
                latestHostSnapshot?.syncAggression,
                latestHostSnapshot?.syncProfile ?? session.syncProfile,
                latestHostSnapshot?.platform ?? session.room?.currentPlatform
            );
            sendSyncCommand(senderTabId, {
                type: 'SYNC_ALL',
                time: latestSyncState.time,
                isPlaying: latestSyncState.isPlaying,
                playbackRate: latestHostSnapshot?.playbackRate ?? 1,
                nudgePercent: tuning.nudgePercent,
                toleranceSeconds: 0.18,
                force: true
            }, {
                profile: resolvedProfile,
                platform: viewerPlatform,
                frameId: senderFrameId,
                seq: latestHostSnapshot?.seq,
                driftSeconds,
                playMismatch,
                details: 'viewer_override_recovery'
            });
            lastViewerPlaybackIntent = {
                isPlaying: latestSyncState.isPlaying,
                timeSeconds: latestSyncState.time,
                at: now
            };
        }
    }

    // Viewer-side auto-recovery after Netflix ads end.
    if (message.platform === 'netflix' && message.reason === 'ad_end') {
        const now = Date.now();
        if (now - lastViewerNetflixSeekAt < 900) return;

        const resolvedProfile = toEffectiveSyncProfile(
            session.room?.syncProfile ?? session.syncProfile,
            session.room?.currentPlatform ?? 'netflix'
        );
        lastViewerNetflixSeekAt = now;
        lastViewerAutoSyncAt = now;
        sendSyncCommand(senderTabId, { type: 'SYNC_SEEK', time: latestSyncState.time }, {
            profile: resolvedProfile,
            platform: 'netflix',
            frameId: senderFrameId,
            seq: latestHostSnapshot?.seq,
            details: 'netflix_ad_end_seek'
        });

        setTimeout(() => {
            sendSyncCommand(
                senderTabId,
                { type: latestSyncState.isPlaying ? 'SYNC_PLAY' : 'SYNC_PAUSE' },
                {
                    profile: resolvedProfile,
                    platform: 'netflix',
                    frameId: senderFrameId,
                    seq: latestHostSnapshot?.seq,
                    details: 'netflix_ad_end_playback'
                }
            );
            lastViewerNetflixPlayPauseAt = Date.now();
        }, 260);
    }
}

async function restoreSessionFromStorage() {
    if (hasRestoredFromStorage) return;
    hasRestoredFromStorage = true;

    // Restore volume boost (user preference, independent of session)
    try {
        const volumeData = await chrome.storage.local.get(VOLUME_BOOST_STORAGE_KEY);
        const storedBoost = volumeData[VOLUME_BOOST_STORAGE_KEY];
        if (typeof storedBoost === 'number' && Number.isFinite(storedBoost)) {
            volumeBoostPercent = Math.max(0, Math.min(600, Math.round(storedBoost)));
        }
    } catch { /* ignore */ }

    const canReadLegacyKey = !chrome.extension.inIncognitoContext;
    const storageKeys = canReadLegacyKey
        ? [SESSION_STORAGE_KEY, LEGACY_SESSION_STORAGE_KEY]
        : [SESSION_STORAGE_KEY];
    const stored = await chrome.storage.local.get(storageKeys);
    let data = stored[SESSION_STORAGE_KEY] as StoredSession | undefined;

    if (!data && canReadLegacyKey) {
        data = stored[LEGACY_SESSION_STORAGE_KEY] as StoredSession | undefined;
        if (data?.roomId && data.username) {
            await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: data });
            await chrome.storage.local.remove(LEGACY_SESSION_STORAGE_KEY);
        }
    }

    if (!data?.roomId || !data.username) {
        broadcastSessionState();
        return;
    }

    if (typeof data.savedAt === 'number' && Date.now() - data.savedAt > SESSION_RESTORE_MAX_AGE_MS) {
        await chrome.storage.local.remove([SESSION_STORAGE_KEY, LEGACY_SESSION_STORAGE_KEY]);
        broadcastSessionState();
        return;
    }

    try {
        await startSession({
            roomId: data.roomId,
            username: data.username,
            tabId: data.mediaTabId,
            syncAggression: data.syncAggression,
            syncProfile: data.syncProfile
        });
    } catch {
        await leaveSession();
    }
}

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => console.error(error));

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'watchparty-panel') return;

    const connectedTabId = session.mediaTabId;
    panelPorts.set(port, { tabId: connectedTabId, lastSeenAt: Date.now() });
    if (connectedTabId) {
        minimizedTabs.delete(connectedTabId);
        dismissedWidgetTabs.delete(connectedTabId);
    }
    clearUnreadChat();
    if (connectedTabId) {
        void safeSendToTab(connectedTabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
    }
    void pushFloatingWidgetStatus();

    // Auto-start volume boost capture whenever panel opens (even at 100% for immediate availability)
    if (connectedTabId && volumeBoostCaptureTabId !== connectedTabId) {
        console.log('[WatchParty] Panel opened, starting volume boost capture (current: ' + volumeBoostPercent + '%)');
        void startVolumeBoostCapture(connectedTabId);
    }

    port.onMessage.addListener((raw) => {
        const current = panelPorts.get(port);
        if (!current) return;

        current.lastSeenAt = Date.now();

        if (typeof raw?.tabId === 'number') {
            current.tabId = raw.tabId;
            if (session.mediaTabId === raw.tabId) {
                clearUnreadChat();
            }
        }

        void pushFloatingWidgetStatus();
    });

    port.onDisconnect.addListener(() => {
        panelPorts.delete(port);

        void pushFloatingWidgetStatus();
    });
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (raw?.type === 'WATCHPARTY_RESTORE_PANEL') {
        const tabId = sender.tab?.id || (Number.isInteger(raw.tabId) ? Number(raw.tabId) : null);
        if (!tabId) {
            sendResponse({ ok: false, reason: 'missing-tab-id' });
            return true;
        }

        minimizedTabs.delete(tabId);
        dismissedWidgetTabs.delete(tabId);
        chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'index.html' }, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, reason: chrome.runtime.lastError.message || 'set-options-failed' });
                return;
            }

            chrome.sidePanel.open({ tabId }, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ ok: false, reason: chrome.runtime.lastError.message || 'open-failed' });
                    return;
                }

                if (session.mediaTabId === tabId) {
                    clearUnreadChat();
                }

                void safeSendToTab(tabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' })
                    .finally(() => {
                        void pushFloatingWidgetStatus();
                        sendResponse({ ok: true });
                    });
            });
        });
        return true;
    }

    void (async () => {
        try {
            if (raw?.type === 'LOCAL_STATE') {
                await handleLocalStateMessage(raw as LocalStateMessage, sender);
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_GET_SESSION_STATE') {
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_GET_SERVER_URL') {
                sendResponse({ ok: true, serverUrl: getServerBaseUrl() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_SET_SERVER_URL') {
                const nextServerUrl = await setServerBaseUrl(raw.url);
                sendResponse({ ok: true, serverUrl: nextServerUrl });
                return;
            }

            if (raw?.type === 'WATCHPARTY_GET_CHAT_HISTORY') {
                const requestedRoomId = typeof raw.roomId === 'string' && raw.roomId.trim().length > 0
                    ? raw.roomId.trim()
                    : session.roomId;
                sendResponse({ ok: true, history: getRoomTimelineMessages(requestedRoomId) });
                return;
            }

            if (raw?.type === 'WATCHPARTY_GET_FLOAT_STATUS') {
                const tabId = sender.tab?.id || (Number.isInteger(raw.tabId) ? Number(raw.tabId) : null);
                sendResponse({ ok: true, payload: getFloatingWidgetStatusPayload(tabId) });
                return;
            }

            if (raw?.type === 'WATCHPARTY_NETFLIX_MAIN_SEEK' || raw?.type === 'WATCHPARTY_NETFLIX_MAIN_COMMAND') {
                const tabId = sender.tab?.id;
                const command = raw?.type === 'WATCHPARTY_NETFLIX_MAIN_SEEK'
                    ? 'seek'
                    : (raw?.command === 'seek' || raw?.command === 'play' || raw?.command === 'pause' || raw?.command === 'state'
                        ? raw.command
                        : null);
                const timeSeconds = typeof raw.timeSeconds === 'number' ? raw.timeSeconds : NaN;

                if (!tabId) {
                    sendResponse({ ok: false, reason: 'missing-tab-id', handled: false });
                    return;
                }

                if (!command) {
                    sendResponse({ ok: false, reason: 'invalid-command', handled: false });
                    return;
                }

                if (command === 'seek' && !Number.isFinite(timeSeconds)) {
                    sendResponse({ ok: false, reason: 'invalid-time', handled: false });
                    return;
                }

                const execution = await chrome.scripting.executeScript({
                    target: { tabId },
                    world: 'MAIN',
                    func: (op: 'seek' | 'play' | 'pause' | 'state', seconds: number) => {
                        try {
                            const win = window as unknown as {
                                netflix?: {
                                    appContext?: {
                                        state?: {
                                            playerApp?: {
                                                getAPI?: () => {
                                                    videoPlayer?: {
                                                        getAllPlayerSessionIds?: () => string[];
                                                        getVideoPlayerBySessionId?: (id: string) => {
                                                            seek?: (timeMs: number) => void;
                                                            play?: () => void;
                                                            pause?: () => void;
                                                            getCurrentTime?: () => number;
                                                            getSegmentTime?: () => number;
                                                            isPaused?: () => boolean;
                                                            getBusy?: () => unknown;
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    cadmium?: {
                                        objects?: {
                                            videoPlayer?: () => {
                                                seek?: (timeMs: number) => void;
                                                play?: () => void;
                                                pause?: () => void;
                                                getCurrentTime?: () => number;
                                                getSegmentTime?: () => number;
                                                isPaused?: () => boolean;
                                                getBusy?: () => unknown;
                                            };
                                        };
                                    };
                                };
                            };

                            const api = win.netflix?.appContext?.state?.playerApp?.getAPI?.();
                            const videoPlayerApi = api?.videoPlayer;
                            const sessionIds = videoPlayerApi?.getAllPlayerSessionIds?.() || [];
                            const sessionId = sessionIds[0];
                            const player =
                                (sessionId ? videoPlayerApi?.getVideoPlayerBySessionId?.(sessionId) : null) ||
                                win.netflix?.cadmium?.objects?.videoPlayer?.();

                            if (!player) {
                                return { handled: false };
                            }

                            if (op === 'seek') {
                                if (!player.seek) return { handled: false };
                                player.seek(Math.max(0, Math.round(seconds * 1000)));
                                return { handled: true };
                            }

                            if (op === 'play') {
                                if (!player.play) return { handled: false };
                                player.play();
                                return { handled: true };
                            }

                            if (op === 'pause') {
                                if (!player.pause) return { handled: false };
                                player.pause();
                                return { handled: true };
                            }

                            if (op === 'state') {
                                const adSelectors = [
                                    '[data-uia*="ad-break" i]',
                                    '[data-uia*="adbreak" i]',
                                    '[data-uia*="ad-countdown" i]',
                                    '[data-uia*="ad_countdown" i]',
                                    '.ad-break',
                                    '.adBreak',
                                    '.watch-video--ad',
                                    '.watch-video--ads'
                                ];

                                let watchingAds = false;
                                for (const selector of adSelectors) {
                                    const element = document.querySelector(selector);
                                    if (element instanceof HTMLElement && element.offsetParent !== null) {
                                        watchingAds = true;
                                        break;
                                    }
                                }

                                const segmentTimeMs = typeof player.getSegmentTime === 'function'
                                    ? player.getSegmentTime()
                                    : undefined;
                                const currentTimeMs = Number.isFinite(segmentTimeMs as number)
                                    ? segmentTimeMs
                                    : (typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : undefined);

                                const timeSeconds = Number.isFinite(currentTimeMs as number)
                                    ? Math.max(0, Number(currentTimeMs) / 1000)
                                    : null;
                                const paused = typeof player.isPaused === 'function'
                                    ? Boolean(player.isPaused())
                                    : null;
                                const loading = typeof player.getBusy === 'function'
                                    ? player.getBusy() !== null
                                    : null;

                                return {
                                    handled: true,
                                    payload: { timeSeconds, paused, loading, watchingAds }
                                };
                            }

                            return { handled: false };
                        } catch {
                            return { handled: false };
                        }
                    },
                    args: [command, Number.isFinite(timeSeconds) ? timeSeconds : 0]
                });

                const result = execution?.[0]?.result as
                    | { handled?: boolean; payload?: { timeSeconds?: number | null; paused?: boolean | null; loading?: boolean | null; watchingAds?: boolean | null } }
                    | undefined;

                sendResponse({
                    ok: true,
                    handled: Boolean(result?.handled),
                    payload: result?.payload ?? null
                });
                return;
            }

            if (raw?.type === 'WATCHPARTY_DISMISS_FLOAT_BUBBLE') {
                const tabId = Number.isInteger(raw.tabId) ? Number(raw.tabId) : sender.tab?.id;
                if (!tabId) {
                    sendResponse({ ok: false, reason: 'missing-tab-id' });
                    return;
                }
                dismissedWidgetTabs.add(tabId);
                if (session.mediaTabId === tabId) {
                    clearUnreadChat();
                }
                await safeSendToTab(tabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
                void pushFloatingWidgetStatus();
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_CREATE_ROOM') {
                const hostUsernameRaw = typeof raw.hostUsername === 'string' ? raw.hostUsername.trim() : '';
                const initialMedia = sanitizeInitialMedia(raw.initialMedia);
                const createdRoom = await createRoomOnServer({
                    hostUsername: hostUsernameRaw || undefined,
                    initialMedia
                });
                sendResponse({
                    ok: true,
                    roomId: createdRoom.roomId,
                    hostId: createdRoom.hostId,
                    username: createdRoom.username,
                    joinLink: createdRoom.joinLink
                });
                return;
            }

            if (raw?.type === 'WATCHPARTY_START_SESSION') {
                await startSession({
                    roomId: String(raw.roomId || ''),
                    username: String(raw.username || ''),
                    tabId: typeof raw.tabId === 'number' ? raw.tabId : undefined,
                    syncAggression: typeof raw.syncAggression === 'number' ? raw.syncAggression : undefined,
                    syncProfile: isSyncProfile(raw.syncProfile) ? raw.syncProfile : undefined
                });
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_UPDATE_ACTIVE_TAB') {
                const tabId = typeof raw.tabId === 'number' ? raw.tabId : null;
                if (tabId) {
                    const panelOpenForTab = isPanelOpenForTab(tabId);
                    const previousMediaTabId = session.mediaTabId;
                    if (session.mediaTabId && session.mediaTabId !== tabId) {
                        clearPreferredMediaFrame(session.mediaTabId);
                    }
                    session.mediaTabId = tabId;
                    if (panelOpenForTab) {
                        minimizedTabs.delete(tabId);
                        dismissedWidgetTabs.delete(tabId);
                    }
                    clearPreferredMediaFrame(tabId);
                    if (panelOpenForTab) {
                        clearUnreadChat();
                    }
                    await persistSession();
                    if (panelOpenForTab) {
                        await safeSendToTab(tabId, { type: 'WATCHPARTY_HIDE_FLOAT_BUBBLE' });
                    }
                    await chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'index.html' });
                    broadcastSessionState();

                    // Restart volume boost capture when tab changed
                    if (previousMediaTabId !== tabId) {
                        console.log('[WatchParty] Active tab changed, restarting volume boost capture');
                        void stopVolumeBoostCapture().then(() => {
                            setTimeout(() => {
                                void startVolumeBoostCapture(tabId);
                            }, 150);
                        });
                    }
                }
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_SET_SYNC_AGGRESSION') {
                session.syncAggression = clampSyncAggression(Number(raw.value));
                await persistSession();
                broadcastSessionState();
                if (isHost()) {
                    void requestAndEmitHostSnapshot(false, 'event');
                }
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_SET_SYNC_PROFILE') {
                session.syncProfile = clampSyncProfile(raw.value);
                await persistSession();
                broadcastSessionState();
                if (isHost()) {
                    void requestAndEmitHostSnapshot(true, 'event');
                }
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_SET_VOLUME_BOOST') {
                const previousPercent = volumeBoostPercent;
                const rawPercent = Number(raw.value);
                volumeBoostPercent = Number.isFinite(rawPercent)
                    ? Math.max(0, Math.min(600, Math.round(rawPercent)))
                    : DEFAULT_VOLUME_BOOST;

                // Persist independently of session (user preference)
                await chrome.storage.local.set({ [VOLUME_BOOST_STORAGE_KEY]: volumeBoostPercent });

                // Route to offscreen document via tabCapture
                const tabId = session.mediaTabId;
                if (volumeBoostPercent === DEFAULT_VOLUME_BOOST) {
                    // Reset to 100% — stop capture
                    void stopVolumeBoostCapture();
                } else if (previousPercent === DEFAULT_VOLUME_BOOST && volumeBoostPercent !== DEFAULT_VOLUME_BOOST && tabId) {
                    // Transitioning from 100% to boost — start capture
                    void startVolumeBoostCapture(tabId);
                } else if (volumeBoostCaptureTabId && tabId && volumeBoostCaptureTabId === tabId) {
                    // Already capturing on this tab — just update gain
                    updateVolumeBoostGain(volumeBoostPercent / 100);
                } else if (tabId && volumeBoostCaptureTabId !== tabId) {
                    // Tab changed while boosting — restart capture
                    void stopVolumeBoostCapture().then(() => startVolumeBoostCapture(tabId));
                }

                broadcastSessionState();
                sendResponse({ ok: true, volumeBoost: volumeBoostPercent });
                return;
            }

            if (raw?.type === 'WATCHPARTY_SEND_CHAT') {
                const text = String(raw.text || '').trim();
                if (socket && session.active && text) {
                    socket.emit('message', { type: 'chat.send', payload: { text } });
                }
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_MANUAL_SYNC') {
                await requestAndEmitHostSnapshot(true, 'event');
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_REQUEST_SYNC') {
                if (socket && session.active && !isHost()) {
                    socket.emit('message', {
                        type: 'sync.viewer_request_sync',
                        payload: { reason: String(raw.reason || 'manual-request') }
                    });
                }
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_LEAVE_SESSION') {
                await leaveSession();
                sendResponse({ ok: true, state: toPublicSessionState() });
                return;
            }

            if (raw?.type === 'WATCHPARTY_MINIMIZE_PANEL') {
                let tabId = Number.isInteger(raw.tabId) ? Number(raw.tabId) : sender.tab?.id || session.mediaTabId;
                if (!tabId) {
                    const activeTab = await getActiveTabInCurrentWindow();
                    tabId = activeTab?.id ?? null;
                }
                if (!tabId) {
                    sendResponse({ ok: false, reason: 'missing-tab-id' });
                    return;
                }
                await handlePanelMinimize(tabId);
                sendResponse({ ok: true });
                return;
            }

            if (raw?.type === 'WATCHPARTY_RESTORE_PANEL') {
                let tabId = sender.tab?.id || (Number.isInteger(raw.tabId) ? Number(raw.tabId) : null) || session.mediaTabId;
                if (!tabId) {
                    const activeTab = await getActiveTabInCurrentWindow();
                    tabId = activeTab?.id ?? null;
                }
                if (!tabId) {
                    sendResponse({ ok: false, reason: 'missing-tab-id' });
                    return;
                }
                await handlePanelRestore(tabId);
                sendResponse({ ok: true });
                return;
            }

            sendResponse({ ok: false, reason: 'unhandled-message' });
        } catch (error) {
            sendResponse({ ok: false, reason: String(error) });
        }
    })();

    return true;
});

async function bootstrapBackground() {
    await restoreServerBaseUrl();
    await restoreSessionFromStorage();
    await hydrateFloatingWidgetAcrossOpenTabs();
}

void bootstrapBackground();

chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!session.active) return;
    const tabId = activeInfo.tabId;
    void (async () => {
        const tab = await getTabById(tabId);
        if (!tab?.id || !isWebTabUrl(tab.url)) return;
        await ensureFloatingWidgetBridgeForTab(tab.id, tab.url);
    })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const isSessionTab = session.mediaTabId === tabId;
    if (
        session.active &&
        (changeInfo.status === 'complete' || typeof changeInfo.url === 'string')
    ) {
        const candidateUrl = typeof changeInfo.url === 'string' ? changeInfo.url : tab.url;
        if (isWebTabUrl(candidateUrl)) {
            void ensureFloatingWidgetBridgeForTab(tabId, candidateUrl);
        }
    }

    if (isSessionTab || minimizedTabs.has(tabId)) {
        void pushFloatingWidgetStatus();
    }

    // Restart volume boost capture when URL changes (e.g., user navigates to Netflix)
    if (
        volumeBoostCaptureTabId === tabId &&
        (typeof changeInfo.url === 'string' || changeInfo.status === 'complete')
    ) {
        console.log('[WatchParty] Tab URL changed, restarting volume boost capture');
        void stopVolumeBoostCapture().then(() => {
            // Small delay to ensure page has loaded
            setTimeout(() => {
                void startVolumeBoostCapture(tabId);
            }, 300);
        });
    }

    if (!isSessionTab || !session.active || !isHost()) return;

    if (typeof changeInfo.url === 'string' && changeInfo.url.startsWith('http')) {
        void emitHostRoomUrlUpdateFromTab(tabId, tab);
        return;
    }

    if (changeInfo.status === 'complete') {
        void emitHostRoomUrlUpdateFromTab(tabId, tab);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    minimizedTabs.delete(tabId);
    dismissedWidgetTabs.delete(tabId);
    clearPreferredMediaFrame(tabId);
    for (const [port, state] of panelPorts.entries()) {
        if (state.tabId === tabId) {
            panelPorts.delete(port);
        }
    }
    if (volumeBoostCaptureTabId === tabId) {
        void stopVolumeBoostCapture();
    }
    if (session.mediaTabId === tabId) {
        session.mediaTabId = null;
        clearUnreadChat();
        void persistSession();
        broadcastSessionState();
    }
});
