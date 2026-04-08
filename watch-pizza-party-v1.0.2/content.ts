(() => {
const WATCHPARTY_CONTENT_CONTROL_KEY = '__watchPartyContentControl';
const windowWithContentControl = window as unknown as Window & {
    [key: string]: { isAlive?: () => boolean } | undefined;
};
const existingContentControl = windowWithContentControl[WATCHPARTY_CONTENT_CONTROL_KEY];

let shouldBootContentScript = true;
if (existingContentControl?.isAlive) {
    try {
        shouldBootContentScript = !existingContentControl.isAlive();
    } catch {
        shouldBootContentScript = true;
    }
}

if (shouldBootContentScript) {
    windowWithContentControl[WATCHPARTY_CONTENT_CONTROL_KEY] = {
        isAlive: () => {
            try {
                return Boolean(chrome?.runtime?.id);
            } catch {
                return false;
            }
        }
    };
    (() => {
type LocalStateReason = 'initial' | 'play' | 'pause' | 'seek' | 'tick' | 'navigation' | 'ad_start' | 'ad_end';
type Platform = 'youtube' | 'netflix' | 'unknown';

type LocalStateMessage = {
    type: 'LOCAL_STATE';
    reason: LocalStateReason;
    url: string;
    title: string;
    mediaId?: string;
    platform: Platform;
    time: number;
    isPlaying: boolean;
    playbackRate: number;
    inAd: boolean;
    mediaScore: number;
    frameUrl: string;
};

type SyncCommandMessage =
    | { type: 'SYNC_PLAY' }
    | { type: 'SYNC_PAUSE' }
    | { type: 'SYNC_SEEK'; time: number }
    | { type: 'SYNC_ALL'; time: number; isPlaying: boolean; playbackRate?: number; toleranceSeconds?: number; nudgePercent?: number; force?: boolean };

type NetflixPlayerLike = {
    play?: () => void;
    pause?: () => void;
    seek?: (timeMs: number) => void;
    getCurrentTime?: () => number;
    getSegmentTime?: () => number;
    isPaused?: () => boolean;
    getBusy?: () => unknown;
};

type NetflixMainCommand = 'seek' | 'play' | 'pause' | 'state';

type NetflixMainState = {
    timeSeconds: number;
    paused: boolean;
    loading: boolean;
    watchingAds: boolean;
    updatedAt: number;
};

type YoutubeMainState = {
    timeSeconds: number;
    paused: boolean;
    playbackRate: number;
    loading: boolean;
    watchingAds: boolean;
    updatedAt: number;
};

type MainBridgeCommand =
    | 'youtube.state'
    | 'youtube.play'
    | 'youtube.pause'
    | 'youtube.seek'
    | 'youtube.rate'
    | 'netflix.state'
    | 'netflix.play'
    | 'netflix.pause'
    | 'netflix.seek';

type MainBridgePayload = {
    timeSeconds?: number;
    playbackRate?: number;
    paused?: boolean;
    loading?: boolean;
    watchingAds?: boolean;
};

type MainBridgeResponse = {
    ok: boolean;
    handled: boolean;
    payload?: MainBridgePayload | null;
};

let lastCommandTime = 0;
let videoElement: HTMLVideoElement | null = null;
let lastKnownUrl = window.location.href;
let lastKnownTitle = document.title;
let lastTickBucket = -1;
let lastSentSignature = '';
let pendingSyncCommand: SyncCommandMessage | null = null;
let lastInAdState = false;
let lastHardSeekAt = 0;
let lastObservedPlayingState: boolean | null = null;
let lastAppliedSyncCommand:
    | { at: number; type: SyncCommandMessage['type']; time?: number; isPlaying?: boolean; force?: boolean }
    | null = null;
let restoreBubbleButton: HTMLButtonElement | null = null;
let restoreBubbleMetaLabel: HTMLSpanElement | null = null;
let restoreBubbleStateLabel: HTMLSpanElement | null = null;
let restoreBubbleUnreadBadge: HTMLSpanElement | null = null;
let restoreBubbleActionBadge: HTMLSpanElement | null = null;
let restoreBubbleCloseButton: HTMLButtonElement | null = null;
let restoreBubbleCloseConfirmTimer: number | null = null;
let restoreBubbleActionEmojiTimer: number | null = null;
let bubbleTopPx = 0;
let bubbleDragActive = false;
let bubbleDragStartPointerY = 0;
let bubbleDragStartTop = 0;
let bubbleDragMoved = false;
let suppressRestoreClickUntil = 0;
let netflixMainState: NetflixMainState | null = null;
let netflixMainStatePollPending = false;
let netflixMainStateLastPollAt = 0;
let youtubeMainState: YoutubeMainState | null = null;
let youtubeMainStatePollPending = false;
let youtubeMainStateLastPollAt = 0;
let mainBridgeInjected = false;
let mainBridgeResponseListenerAttached = false;
let mainBridgeRequestSeq = 0;
const pendingMainBridgeRequests = new Map<number, (response: MainBridgeResponse | null) => void>();

const FLOAT_BUBBLE_TOP_STORAGE_KEY = 'watchparty_float_bubble_top_px';
const FLOAT_BUBBLE_MARGIN_PX = 10;
const FLOAT_STATUS_POLL_MS = 2200;
const NETFLIX_MAIN_STATE_POLL_MS = 450;
const NETFLIX_MAIN_STATE_STALE_MS = 1300;
const YOUTUBE_MAIN_STATE_POLL_MS = 260;
const YOUTUBE_MAIN_STATE_STALE_MS = 900;
const MAIN_BRIDGE_NAMESPACE = 'watchpizzaparty-bridge-v1';
const MAIN_BRIDGE_REQUEST_EVENT = 'watchpizzaparty:bridge:request';
const MAIN_BRIDGE_RESPONSE_EVENT = 'watchpizzaparty:bridge:response';
const MAIN_BRIDGE_SCRIPT_ID = 'watchpizzaparty-main-bridge';

type FloatStatusPayload = {
    active: boolean;
    show: boolean;
    participants: number;
    unread: number;
    roomId?: string | null;
    isHost?: boolean;
    connected?: boolean;
    requestEmoji?: string | null;
    requestEmojiExpiresAt?: number | null;
};

const restoreBubbleStatus: FloatStatusPayload = {
    active: false,
    show: false,
    participants: 0,
    unread: 0,
    roomId: null,
    isHost: false,
    connected: false,
    requestEmoji: null,
    requestEmojiExpiresAt: 0
};
let floatStatusPollTimer: number | null = null;

type PageInfo = {
    url: string;
    platform: Platform;
    mediaId?: string;
    title?: string;
    updatedAt: number;
};

let cachedPageInfo: PageInfo | null = null;
const IS_TOP_FRAME = (() => {
    try {
        return window.top === window;
    } catch {
        return false;
    }
})();

function isRuntimeAvailable(): boolean {
    try {
        return Boolean(chrome?.runtime?.id);
    } catch {
        return false;
    }
}

function safeRuntimeSendMessage<T = unknown>(
    message: Record<string, unknown>,
    onResponse?: (response: T | null) => void
): boolean {
    if (!isRuntimeAvailable()) {
        onResponse?.(null);
        return false;
    }

    try {
        chrome.runtime.sendMessage(message, (response?: T) => {
            let hadRuntimeError = false;
            try {
                hadRuntimeError = Boolean(chrome.runtime.lastError);
            } catch {
                hadRuntimeError = true;
            }
            if (hadRuntimeError) {
                onResponse?.(null);
                return;
            }
            onResponse?.((response ?? null) as T | null);
        });
        return true;
    } catch {
        onResponse?.(null);
        return false;
    }
}

function attachMainBridgeResponseListener() {
    if (!IS_TOP_FRAME || mainBridgeResponseListenerAttached) return;
    mainBridgeResponseListenerAttached = true;

    window.addEventListener(MAIN_BRIDGE_RESPONSE_EVENT, (event) => {
        const customEvent = event as CustomEvent<{
            namespace?: string;
            direction?: string;
            id?: number;
            ok?: boolean;
            handled?: boolean;
            payload?: MainBridgePayload | null;
        }>;
        const detail = customEvent.detail;
        if (!detail || detail.namespace !== MAIN_BRIDGE_NAMESPACE || detail.direction !== 'to-content') return;
        if (typeof detail.id !== 'number') return;

        const resolver = pendingMainBridgeRequests.get(detail.id);
        if (!resolver) return;
        pendingMainBridgeRequests.delete(detail.id);
        mainBridgeInjected = true;
        resolver({
            ok: Boolean(detail.ok),
            handled: Boolean(detail.handled),
            payload: detail.payload ?? null
        });
    });
}

function ensureMainBridgeInjected(platform?: Platform) {
    if (!IS_TOP_FRAME) return;
    const targetPlatform = platform ?? detectPlatform(window.location.href);
    if (targetPlatform !== 'youtube' && targetPlatform !== 'netflix') return;

    attachMainBridgeResponseListener();
    if (mainBridgeInjected) return;

    const existing = document.getElementById(MAIN_BRIDGE_SCRIPT_ID);
    if (existing) {
        mainBridgeInjected = true;
        return;
    }

    let scriptUrl = '';
    try {
        scriptUrl = chrome.runtime.getURL('player-bridge.js');
    } catch {
        return;
    }
    if (!scriptUrl) return;

    const script = document.createElement('script');
    script.id = MAIN_BRIDGE_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.dataset.watchPartyBridge = 'true';
    script.onload = () => {
        mainBridgeInjected = true;
        script.remove();
    };
    script.onerror = () => {
        script.remove();
    };

    try {
        (document.head || document.documentElement)?.appendChild(script);
    } catch {
        script.remove();
    }
}

function requestMainBridgeCommand(
    command: MainBridgeCommand,
    payload?: Record<string, unknown>,
    timeoutMs = 280
): Promise<MainBridgeResponse | null> {
    if (!IS_TOP_FRAME) return Promise.resolve(null);
    ensureMainBridgeInjected();

    const id = ++mainBridgeRequestSeq;
    return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
            pendingMainBridgeRequests.delete(id);
            resolve(null);
        }, timeoutMs);

        pendingMainBridgeRequests.set(id, (response) => {
            window.clearTimeout(timeout);
            resolve(response);
        });

        window.dispatchEvent(new CustomEvent(MAIN_BRIDGE_REQUEST_EVENT, {
            detail: {
                namespace: MAIN_BRIDGE_NAMESPACE,
                direction: 'to-page',
                id,
                command,
                payload: payload ?? null
            }
        }));
    });
}

function shouldDropDuplicateSyncCommand(message: SyncCommandMessage): boolean {
    if (!lastAppliedSyncCommand) return false;

    const now = Date.now();
    const elapsedMs = now - lastAppliedSyncCommand.at;
    const previous = lastAppliedSyncCommand;

    if (message.type === 'SYNC_PLAY' || message.type === 'SYNC_PAUSE') {
        return previous.type === message.type && elapsedMs < 220;
    }

    if (message.type === 'SYNC_SEEK') {
        return (
            previous.type === 'SYNC_SEEK' &&
            typeof previous.time === 'number' &&
            elapsedMs < 520 &&
            Math.abs(previous.time - message.time) < 0.25
        );
    }

    if (message.type === 'SYNC_ALL') {
        return previous.type === 'SYNC_ALL' && !message.force && !previous.force && elapsedMs < 180;
    }

    return false;
}

function markSyncCommandApplied(message: SyncCommandMessage) {
    lastAppliedSyncCommand = {
        at: Date.now(),
        type: message.type,
        time:
            message.type === 'SYNC_SEEK' || message.type === 'SYNC_ALL'
                ? Number.isFinite(message.time)
                    ? Number(message.time)
                    : undefined
                : undefined,
        isPlaying: message.type === 'SYNC_ALL' ? message.isPlaying : undefined,
        force: message.type === 'SYNC_ALL' ? Boolean(message.force) : undefined
    };
}

function getNetflixPlayer(): NetflixPlayerLike | null {
    try {
        const win = window as unknown as {
            netflix?: {
                appContext?: {
                    state?: {
                        playerApp?: {
                            getAPI?: () => {
                                videoPlayer?: {
                                    getAllPlayerSessionIds?: () => string[];
                                    getVideoPlayerBySessionId?: (id: string) => NetflixPlayerLike;
                                };
                            };
                        };
                    };
                };
                cadmium?: {
                    objects?: {
                        videoPlayer?: () => NetflixPlayerLike;
                    };
                };
            };
        };

        const api = win.netflix?.appContext?.state?.playerApp?.getAPI?.();
        const videoPlayerApi = api?.videoPlayer;
        const sessionIds = videoPlayerApi?.getAllPlayerSessionIds?.() || [];
        const sessionId = sessionIds[0];
        if (sessionId) {
            const player = videoPlayerApi?.getVideoPlayerBySessionId?.(sessionId);
            if (player) return player;
        }

        const legacyPlayer = win.netflix?.cadmium?.objects?.videoPlayer?.();
        if (legacyPlayer) return legacyPlayer;
    } catch {
        // Netflix internals may be unavailable or changed.
    }

    return null;
}

function requestNetflixMainSeek(timeSeconds: number): Promise<boolean> {
    return requestNetflixMainCommand('seek', timeSeconds).then((response) => Boolean(response?.ok && response?.handled));
}

function requestNetflixMainCommand(
    command: NetflixMainCommand,
    timeSeconds?: number
): Promise<{ ok: boolean; handled: boolean; payload?: { timeSeconds?: number | null; paused?: boolean | null; loading?: boolean | null; watchingAds?: boolean | null } | null } | null> {
    const bridgeCommand: MainBridgeCommand =
        command === 'state'
            ? 'netflix.state'
            : command === 'play'
                ? 'netflix.play'
                : command === 'pause'
                    ? 'netflix.pause'
                    : 'netflix.seek';

    const bridgeResponsePromise = requestMainBridgeCommand(
        bridgeCommand,
        command === 'seek' ? { timeSeconds } : undefined,
        command === 'state' ? 340 : 220
    ).then((response) => {
        if (!response?.ok || !response.handled) return null;
        return {
            ok: true,
            handled: true,
            payload: {
                timeSeconds: Number.isFinite(response.payload?.timeSeconds)
                    ? Number(response.payload?.timeSeconds)
                    : null,
                paused: typeof response.payload?.paused === 'boolean' ? response.payload.paused : null,
                loading: typeof response.payload?.loading === 'boolean' ? response.payload.loading : null,
                watchingAds: typeof response.payload?.watchingAds === 'boolean' ? response.payload.watchingAds : null
            }
        };
    }).catch(() => null);

    return bridgeResponsePromise.then((bridgeResult) => {
        if (bridgeResult?.handled) {
            return bridgeResult;
        }

        return new Promise((resolve) => {
            const sent = safeRuntimeSendMessage<{ ok?: boolean; handled?: boolean; payload?: { timeSeconds?: number | null; paused?: boolean | null; loading?: boolean | null; watchingAds?: boolean | null } | null }>(
                {
                    type: 'WATCHPARTY_NETFLIX_MAIN_COMMAND',
                    command,
                    timeSeconds
                },
                (response) => {
                    resolve({
                        ok: Boolean(response?.ok),
                        handled: Boolean(response?.handled),
                        payload: response?.payload ?? null
                    });
                }
            );
            if (!sent) {
                resolve(null);
            }
        });
    });
}

function getFreshNetflixMainState(): NetflixMainState | null {
    const state = netflixMainState;
    if (!state) return null;
    if (Date.now() - state.updatedAt > NETFLIX_MAIN_STATE_STALE_MS) return null;
    return state;
}

function getFreshYoutubeMainState(): YoutubeMainState | null {
    const state = youtubeMainState;
    if (!state) return null;
    if (Date.now() - state.updatedAt > YOUTUBE_MAIN_STATE_STALE_MS) return null;
    return state;
}

function pollYouTubeMainState(platform: Platform) {
    if (platform !== 'youtube') return;
    if (!IS_TOP_FRAME) return;
    if (youtubeMainStatePollPending) return;

    const now = Date.now();
    if (now - youtubeMainStateLastPollAt < YOUTUBE_MAIN_STATE_POLL_MS) return;

    youtubeMainStateLastPollAt = now;
    youtubeMainStatePollPending = true;
    void requestMainBridgeCommand('youtube.state', undefined, 320)
        .then((response) => {
            if (!response?.ok || !response.handled || !response.payload) return;
            const rawTime = Number(response.payload.timeSeconds);
            const rawPaused = response.payload.paused;
            const rawPlaybackRate = Number(response.payload.playbackRate);
            const rawLoading = response.payload.loading;
            const rawWatchingAds = response.payload.watchingAds;

            if (!Number.isFinite(rawTime) || typeof rawPaused !== 'boolean') {
                return;
            }

            youtubeMainState = {
                timeSeconds: Math.max(0, rawTime),
                paused: rawPaused,
                playbackRate: Number.isFinite(rawPlaybackRate)
                    ? Math.max(0.25, Math.min(4, Number(rawPlaybackRate)))
                    : 1,
                loading: typeof rawLoading === 'boolean' ? rawLoading : false,
                watchingAds: typeof rawWatchingAds === 'boolean' ? rawWatchingAds : false,
                updatedAt: Date.now()
            };
        })
        .finally(() => {
            youtubeMainStatePollPending = false;
        });
}

function pollNetflixMainState(platform: Platform) {
    if (platform !== 'netflix') return;
    if (netflixMainStatePollPending) return;

    const now = Date.now();
    if (now - netflixMainStateLastPollAt < NETFLIX_MAIN_STATE_POLL_MS) return;

    netflixMainStateLastPollAt = now;
    netflixMainStatePollPending = true;
    void requestNetflixMainCommand('state')
        .then((response) => {
            if (!response?.ok || !response.handled || !response.payload) return;
            const rawTime = Number(response.payload.timeSeconds);
            const rawPaused = response.payload.paused;
            const rawLoading = response.payload.loading;
            const rawWatchingAds = response.payload.watchingAds;

            if (!Number.isFinite(rawTime) || typeof rawPaused !== 'boolean') {
                return;
            }

            netflixMainState = {
                timeSeconds: Math.max(0, rawTime),
                paused: rawPaused,
                loading: typeof rawLoading === 'boolean' ? rawLoading : false,
                watchingAds: typeof rawWatchingAds === 'boolean' ? rawWatchingAds : false,
                updatedAt: Date.now()
            };
        })
        .finally(() => {
            netflixMainStatePollPending = false;
        });
}

function safeNetflixSeek(timeSeconds: number): boolean {
    const player = getNetflixPlayer();
    if (!player?.seek) return false;
    try {
        player.seek(Math.max(0, Math.round(timeSeconds * 1000)));
        return true;
    } catch {
        return false;
    }
}

function safeNetflixPlayPause(shouldPlay: boolean): boolean {
    const player = getNetflixPlayer();
    try {
        if (shouldPlay) {
            player?.play?.();
        } else {
            player?.pause?.();
        }
        return Boolean(player);
    } catch {
        return false;
    }
}

function getCurrentPlaybackTime(platform: Platform, fallbackVideo: HTMLVideoElement | null): number {
    if (platform === 'youtube') {
        const freshState = getFreshYoutubeMainState();
        if (freshState) {
            return freshState.timeSeconds;
        }
    }

    if (platform === 'netflix') {
        const freshState = getFreshNetflixMainState();
        if (freshState) {
            return freshState.timeSeconds;
        }

        const player = getNetflixPlayer();
        const segmentTimeMs = player?.getSegmentTime?.();
        const apiTimeMs = Number.isFinite(segmentTimeMs) ? segmentTimeMs : player?.getCurrentTime?.();
        if (Number.isFinite(apiTimeMs)) {
            const apiSeconds = Math.max(0, Number(apiTimeMs) / 1000);
            const domSeconds = fallbackVideo?.currentTime;
            if (Number.isFinite(domSeconds)) {
                const safeDom = Math.max(0, Number(domSeconds));
                if (fallbackVideo && !fallbackVideo.paused && !fallbackVideo.ended) {
                    return Math.max(apiSeconds, safeDom);
                }
            }
            return apiSeconds;
        }
    }

    return fallbackVideo?.currentTime ?? 0;
}

function getCurrentPlaybackRate(platform: Platform, fallbackVideo: HTMLVideoElement | null): number {
    if (platform === 'youtube') {
        const freshState = getFreshYoutubeMainState();
        if (freshState) {
            return freshState.playbackRate;
        }
    }
    return fallbackVideo?.playbackRate ?? 1;
}

function getBubbleHeightPx(): number {
    return restoreBubbleButton?.offsetHeight || 68;
}

function getBubbleTopBounds() {
    const min = FLOAT_BUBBLE_MARGIN_PX;
    const max = Math.max(min, window.innerHeight - getBubbleHeightPx() - FLOAT_BUBBLE_MARGIN_PX);
    return { min, max };
}

function clampBubbleTop(raw: number): number {
    const { min, max } = getBubbleTopBounds();
    return Math.max(min, Math.min(max, Math.round(raw)));
}

function loadBubbleTopPx(): number {
    try {
        const stored = window.localStorage.getItem(FLOAT_BUBBLE_TOP_STORAGE_KEY);
        if (stored) {
            const parsed = Number(stored);
            if (Number.isFinite(parsed)) {
                return clampBubbleTop(parsed);
            }
        }
    } catch {
        // Ignore storage failures.
    }

    return clampBubbleTop(window.innerHeight * 0.46);
}

function saveBubbleTopPx() {
    try {
        window.localStorage.setItem(FLOAT_BUBBLE_TOP_STORAGE_KEY, String(clampBubbleTop(bubbleTopPx)));
    } catch {
        // Ignore storage failures.
    }
}

function applyBubbleTopPosition() {
    const button = ensureRestoreBubbleButton();
    bubbleTopPx = clampBubbleTop(bubbleTopPx || loadBubbleTopPx());
    button.style.top = `${bubbleTopPx}px`;
}

function ensureRestoreBubbleStyles() {
    const styleId = 'watchparty-restore-bubble-styles';
    if (document.getElementById(styleId)) return;

    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = `
@keyframes watchpartyFloatPulse {
  0%, 100% { transform: translateX(0) scale(1); box-shadow: 0 10px 26px rgba(2,6,23,0.48); }
  50% { transform: translateX(0) scale(1.035); box-shadow: 0 12px 34px rgba(251,146,60,0.38); }
}
`;
    try {
        const host = document.head || document.documentElement;
        host?.appendChild(styleTag);
    } catch {
        // Ignore transient DOM/context teardown errors.
    }
}

function getRestoreBubbleHostElement(): HTMLElement | null {
    const fullscreenHost = document.fullscreenElement;
    if (fullscreenHost instanceof HTMLElement) {
        return fullscreenHost;
    }

    if (document.body instanceof HTMLElement) return document.body;
    if (document.documentElement instanceof HTMLElement) return document.documentElement;
    return null;
}

function ensureRestoreBubbleMounted(button: HTMLButtonElement) {
    const host = getRestoreBubbleHostElement();
    if (!host) return;
    if (button.parentElement === host) return;
    try {
        host.appendChild(button);
    } catch {
        // Ignore transient DOM/fullscreen host errors.
    }
}

function ensureRestoreBubbleButton(): HTMLButtonElement {
    if (restoreBubbleButton && restoreBubbleButton.isConnected) {
        ensureRestoreBubbleMounted(restoreBubbleButton);
        return restoreBubbleButton;
    }

    const existing = document.getElementById('watchparty-restore-bubble');
    if (existing instanceof HTMLButtonElement) {
        existing.remove();
    }

    const button = document.createElement('button');
    button.id = 'watchparty-restore-bubble';
    button.type = 'button';
    button.title = 'Open Watch Pizza Party sidebar';
    ensureRestoreBubbleStyles();
    bubbleTopPx = loadBubbleTopPx();

    Object.assign(button.style, {
        position: 'fixed',
        right: '10px',
        top: `${bubbleTopPx}px`,
        transform: 'translateX(0) scale(1)',
        width: '86px',
        height: '74px',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'linear-gradient(180deg, rgba(10,10,10,0.97), rgba(15,23,42,0.95))',
        color: '#f8fafc',
        cursor: 'pointer',
        zIndex: '2147483646',
        boxShadow: '0 14px 30px rgba(2,6,23,0.56)',
        backdropFilter: 'blur(10px) saturate(135%)',
        WebkitBackdropFilter: 'blur(10px) saturate(135%)',
        display: 'none',
        alignItems: 'flex-start',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '3px',
        padding: '9px 10px',
        textAlign: 'left',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease'
    } as Partial<CSSStyleDeclaration>);

    const title = document.createElement('span');
    const titleIconUrl = isRuntimeAvailable() ? chrome.runtime.getURL('icon32.png') : '';
    if (!titleIconUrl) {
        title.textContent = '🍕';
    }
    Object.assign(title.style, {
        width: '22px',
        height: '22px',
        borderRadius: '6px',
        background: titleIconUrl ? `url(\"${titleIconUrl}\") center/cover no-repeat` : '#2563eb',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        fontWeight: '900',
        letterSpacing: '0.04em',
        lineHeight: '1',
        color: '#ffffff'
    } as Partial<CSSStyleDeclaration>);

    const meta = document.createElement('span');
    Object.assign(meta.style, {
        fontSize: '9px',
        lineHeight: '1.1',
        fontWeight: '700',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#cbd5e1'
    } as Partial<CSSStyleDeclaration>);

    const status = document.createElement('span');
    Object.assign(status.style, {
        fontSize: '9px',
        lineHeight: '1.1',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontWeight: '700',
        color: '#93c5fd'
    } as Partial<CSSStyleDeclaration>);

    const unreadBadge = document.createElement('span');
    Object.assign(unreadBadge.style, {
        position: 'absolute',
        top: '-7px',
        right: '-7px',
        minWidth: '20px',
        height: '20px',
        padding: '0 6px',
        borderRadius: '999px',
        background: '#f97316',
        color: '#111827',
        fontSize: '10px',
        fontWeight: '900',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(249,115,22,0.45)'
    } as Partial<CSSStyleDeclaration>);
    unreadBadge.textContent = '0';

    const actionBadge = document.createElement('span');
    Object.assign(actionBadge.style, {
        position: 'absolute',
        top: '-7px',
        left: '-7px',
        minWidth: '20px',
        height: '20px',
        padding: '0 4px',
        borderRadius: '999px',
        background: 'rgba(37,99,235,0.95)',
        color: '#f8fafc',
        fontSize: '11px',
        fontWeight: '800',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(37,99,235,0.45)',
        border: '1px solid rgba(147,197,253,0.5)'
    } as Partial<CSSStyleDeclaration>);
    actionBadge.textContent = '🔄';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.title = 'Hide floating widget';
    closeButton.textContent = 'X';
    Object.assign(closeButton.style, {
        position: 'absolute',
        top: '-7px',
        right: '-7px',
        width: '20px',
        height: '20px',
        borderRadius: '999px',
        border: '1px solid rgba(148,163,184,0.45)',
        background: 'rgba(15,23,42,0.96)',
        color: '#e2e8f0',
        fontSize: '10px',
        fontWeight: '900',
        lineHeight: '1',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(2,6,23,0.55)'
    } as Partial<CSSStyleDeclaration>);

    const hideCloseConfirm = () => {
        if (restoreBubbleCloseConfirmTimer !== null) {
            window.clearTimeout(restoreBubbleCloseConfirmTimer);
            restoreBubbleCloseConfirmTimer = null;
        }
        if (restoreBubbleCloseButton) {
            restoreBubbleCloseButton.style.display = 'none';
        }
    };

    const showCloseConfirm = () => {
        if (!restoreBubbleCloseButton) return;
        if (restoreBubbleCloseConfirmTimer !== null) {
            window.clearTimeout(restoreBubbleCloseConfirmTimer);
            restoreBubbleCloseConfirmTimer = null;
        }
        restoreBubbleCloseButton.style.display = 'inline-flex';
        restoreBubbleCloseConfirmTimer = window.setTimeout(() => {
            hideCloseConfirm();
        }, 3500);
    };

    button.addEventListener('mouseenter', () => {
        if (bubbleDragActive) return;
        button.style.transform = 'translateX(-4px) scale(1.03)';
        button.style.boxShadow = '0 16px 34px rgba(37,99,235,0.35)';
        button.style.borderColor = 'rgba(96,165,250,0.65)';
    });

    button.addEventListener('mouseleave', () => {
        if (bubbleDragActive) return;
        button.style.transform = 'translateX(0) scale(1)';
        button.style.boxShadow = '0 14px 30px rgba(2,6,23,0.56)';
        button.style.borderColor = 'rgba(255,255,255,0.1)';
    });

    button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (event.target === closeButton) return;

        bubbleDragActive = true;
        bubbleDragMoved = false;
        bubbleDragStartPointerY = event.clientY;
        bubbleDragStartTop = bubbleTopPx;
        hideCloseConfirm();
        button.style.transition = 'none';
        button.setPointerCapture(event.pointerId);
    });

    const finishDrag = (event: PointerEvent) => {
        if (!bubbleDragActive) return;
        bubbleDragActive = false;
        button.style.transition = 'transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease';
        button.style.transform = 'translateX(0) scale(1)';
        try {
            if (button.hasPointerCapture(event.pointerId)) {
                button.releasePointerCapture(event.pointerId);
            }
        } catch {
            // Ignore pointer capture edge cases.
        }

        if (bubbleDragMoved) {
            suppressRestoreClickUntil = Date.now() + 260;
            saveBubbleTopPx();
        }
    };

    button.addEventListener('pointermove', (event) => {
        if (!bubbleDragActive) return;
        const deltaY = event.clientY - bubbleDragStartPointerY;
        if (Math.abs(deltaY) > 2) {
            bubbleDragMoved = true;
        }
        bubbleTopPx = clampBubbleTop(bubbleDragStartTop + deltaY);
        button.style.top = `${bubbleTopPx}px`;
    });

    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', finishDrag);

    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showCloseConfirm();
    });

    closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sent = safeRuntimeSendMessage<{ ok?: boolean }>({ type: 'WATCHPARTY_DISMISS_FLOAT_BUBBLE' }, (response) => {
            if (response?.ok !== true) {
                showRestoreBubbleButton();
                return;
            }
            applyFloatStatusStatus({ show: false, unread: 0 });
            hideCloseConfirm();
            hideRestoreBubbleButton();
        });
        if (!sent) {
            hideRestoreBubbleButton();
        }
    });

    button.addEventListener('click', () => {
        if (Date.now() < suppressRestoreClickUntil) {
            return;
        }
        const sent = safeRuntimeSendMessage<{ ok?: boolean }>({ type: 'WATCHPARTY_RESTORE_PANEL' }, (response) => {
            if (response?.ok !== true) {
                showRestoreBubbleButton();
                return;
            }

            applyFloatStatusStatus({ show: false, unread: 0 });
            hideCloseConfirm();
            hideRestoreBubbleButton();
        });
        if (!sent) {
            showRestoreBubbleButton();
        }
    });

    button.appendChild(title);
    button.appendChild(meta);
    button.appendChild(status);
    button.appendChild(actionBadge);
    button.appendChild(unreadBadge);
    button.appendChild(closeButton);

    restoreBubbleButton = button;
    restoreBubbleMetaLabel = meta;
    restoreBubbleStateLabel = status;
    restoreBubbleActionBadge = actionBadge;
    restoreBubbleUnreadBadge = unreadBadge;
    restoreBubbleCloseButton = closeButton;
    ensureRestoreBubbleMounted(button);
    window.addEventListener('resize', () => {
        bubbleTopPx = clampBubbleTop(bubbleTopPx);
        applyBubbleTopPosition();
    });
    return button;
}

function scheduleRestoreBubbleActionEmojiHide() {
    if (restoreBubbleActionEmojiTimer !== null) {
        window.clearTimeout(restoreBubbleActionEmojiTimer);
        restoreBubbleActionEmojiTimer = null;
    }

    const expiresAt = Number(restoreBubbleStatus.requestEmojiExpiresAt) || 0;
    if (expiresAt <= Date.now()) return;

    restoreBubbleActionEmojiTimer = window.setTimeout(() => {
        restoreBubbleActionEmojiTimer = null;
        renderRestoreBubbleStatus();
    }, Math.max(16, expiresAt - Date.now() + 18));
}

function renderRestoreBubbleStatus() {
    const button = ensureRestoreBubbleButton();
    const participantCount = Math.max(0, Number(restoreBubbleStatus.participants) || 0);
    const unreadCount = Math.max(0, Number(restoreBubbleStatus.unread) || 0);
    const actionEmoji = typeof restoreBubbleStatus.requestEmoji === 'string'
        ? restoreBubbleStatus.requestEmoji.trim()
        : '';
    const actionEmojiExpiresAt = Number(restoreBubbleStatus.requestEmojiExpiresAt) || 0;
    const actionEmojiVisible = Boolean(actionEmoji && actionEmojiExpiresAt > Date.now());

    if (restoreBubbleMetaLabel) {
        restoreBubbleMetaLabel.textContent = participantCount > 0 ? `${participantCount} in room` : 'room live';
    }

    if (restoreBubbleStateLabel) {
        if (unreadCount > 0) {
            restoreBubbleStateLabel.textContent = `${Math.min(unreadCount, 99)} new`;
            restoreBubbleStateLabel.style.color = '#fb923c';
        } else if (restoreBubbleStatus.connected) {
            restoreBubbleStateLabel.textContent = 'Live sync';
            restoreBubbleStateLabel.style.color = '#60a5fa';
        } else {
            restoreBubbleStateLabel.textContent = 'Connecting';
            restoreBubbleStateLabel.style.color = '#94a3b8';
        }
    }

    if (restoreBubbleUnreadBadge) {
        if (unreadCount > 0) {
            restoreBubbleUnreadBadge.style.display = 'inline-flex';
            restoreBubbleUnreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        } else {
            restoreBubbleUnreadBadge.style.display = 'none';
        }
    }

    if (restoreBubbleActionBadge) {
        if (actionEmojiVisible) {
            restoreBubbleActionBadge.style.display = 'inline-flex';
            restoreBubbleActionBadge.textContent = actionEmoji;
        } else {
            restoreBubbleActionBadge.style.display = 'none';
        }
    }

    button.style.animation = unreadCount > 0 ? 'watchpartyFloatPulse 2.3s ease-in-out infinite' : 'none';
    scheduleRestoreBubbleActionEmojiHide();
}

function applyFloatStatusStatus(payload: Partial<FloatStatusPayload>) {
    restoreBubbleStatus.active = payload.active ?? restoreBubbleStatus.active;
    restoreBubbleStatus.show = payload.show ?? restoreBubbleStatus.show;
    restoreBubbleStatus.participants = payload.participants ?? restoreBubbleStatus.participants;
    restoreBubbleStatus.unread = payload.unread ?? restoreBubbleStatus.unread;
    restoreBubbleStatus.roomId = payload.roomId ?? restoreBubbleStatus.roomId;
    restoreBubbleStatus.isHost = payload.isHost ?? restoreBubbleStatus.isHost;
    restoreBubbleStatus.connected = payload.connected ?? restoreBubbleStatus.connected;
    if ('requestEmoji' in payload) {
        restoreBubbleStatus.requestEmoji = typeof payload.requestEmoji === 'string' ? payload.requestEmoji : null;
    }
    if ('requestEmojiExpiresAt' in payload) {
        restoreBubbleStatus.requestEmojiExpiresAt =
            typeof payload.requestEmojiExpiresAt === 'number' ? payload.requestEmojiExpiresAt : 0;
    }

    renderRestoreBubbleStatus();

    if (restoreBubbleStatus.active && restoreBubbleStatus.show) {
        showRestoreBubbleButton();
    } else {
        hideRestoreBubbleButton();
    }
}

function showRestoreBubbleButton() {
    const button = ensureRestoreBubbleButton();
    ensureRestoreBubbleMounted(button);
    applyBubbleTopPosition();
    renderRestoreBubbleStatus();
    button.style.display = 'flex';
}

function hideRestoreBubbleButton() {
    if (!restoreBubbleButton || !restoreBubbleButton.isConnected) return;
    if (restoreBubbleCloseConfirmTimer !== null) {
        window.clearTimeout(restoreBubbleCloseConfirmTimer);
        restoreBubbleCloseConfirmTimer = null;
    }
    if (restoreBubbleCloseButton) {
        restoreBubbleCloseButton.style.display = 'none';
    }
    restoreBubbleButton.style.display = 'none';
}

function syncRestoreBubbleForFullscreen() {
    if (!restoreBubbleButton || !restoreBubbleButton.isConnected) return;
    ensureRestoreBubbleMounted(restoreBubbleButton);
    if (restoreBubbleStatus.active && restoreBubbleStatus.show) {
        applyBubbleTopPosition();
        renderRestoreBubbleStatus();
        restoreBubbleButton.style.display = 'flex';
    }
}

function requestFloatingWidgetStatus() {
    safeRuntimeSendMessage<{ payload?: FloatStatusPayload }>({ type: 'WATCHPARTY_GET_FLOAT_STATUS' }, (response) => {
        const payload = response?.payload;
        if (!payload || typeof payload !== 'object') return;

        applyFloatStatusStatus({
            active: Boolean(payload.active),
            show: Boolean(payload.show),
            participants: Number(payload.participants) || 0,
            unread: Number(payload.unread) || 0,
            roomId: typeof payload.roomId === 'string' ? payload.roomId : null,
            isHost: Boolean(payload.isHost),
            connected: Boolean(payload.connected),
            requestEmoji: typeof payload.requestEmoji === 'string' ? payload.requestEmoji : null,
            requestEmojiExpiresAt: typeof payload.requestEmojiExpiresAt === 'number' ? payload.requestEmojiExpiresAt : 0
        });
    });
}

function ensureFloatingWidgetPoll() {
    if (floatStatusPollTimer !== null) return;
    floatStatusPollTimer = window.setInterval(() => {
        requestFloatingWidgetStatus();
    }, FLOAT_STATUS_POLL_MS);
}

function getPrimaryPlatformVideo(platform: Platform): HTMLVideoElement | null {
    if (platform === 'youtube') {
        const ytMain = document.querySelector('video.html5-main-video');
        if (ytMain instanceof HTMLVideoElement) return ytMain;

        const ytPlayerVideo = document.querySelector('.html5-video-player video');
        if (ytPlayerVideo instanceof HTMLVideoElement) return ytPlayerVideo;
    }

    if (platform === 'netflix') {
        const netflixPlayerVideo = document.querySelector('.watch-video video, .NFPlayer video, video[data-uia="video-canvas"]');
        if (netflixPlayerVideo instanceof HTMLVideoElement) return netflixPlayerVideo;
    }

    return null;
}

function scoreVideoCandidate(video: HTMLVideoElement): number {
    if (!video.isConnected) return -1000;

    const rect = video.getBoundingClientRect();
    const area = Math.max(0, rect.width * rect.height);
    const hasDimensions = rect.width > 40 && rect.height > 40;
    const style = window.getComputedStyle(video);
    const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') > 0 &&
        hasDimensions;
    const inViewport =
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;

    let score = 0;
    if (visible) score += 2000;
    if (inViewport) score += 500;
    score += Math.min(area, 3_000_000) / 1000;
    if (video.currentSrc || video.src) score += 200;
    if (!video.paused && !video.ended) score += 800;
    if (video.readyState >= 2) score += 120;
    if (video === videoElement) score += 220;

    return score;
}

function getRankedVideos(platformHint?: Platform): HTMLVideoElement[] {
    const platform = platformHint || detectPlatform(window.location.href);
    const primaryVideo = getPrimaryPlatformVideo(platform);
    const domVideos = Array.from(document.querySelectorAll('video'));
    const uniqueVideos: HTMLVideoElement[] = [];
    const seen = new Set<HTMLVideoElement>();

    const addVideo = (video: HTMLVideoElement | null) => {
        if (!video || seen.has(video)) return;
        seen.add(video);
        uniqueVideos.push(video);
    };

    addVideo(primaryVideo);
    for (const video of domVideos) {
        addVideo(video);
    }

    return uniqueVideos
        .map((video) => ({ video, score: scoreVideoCandidate(video) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.video);
}

function getCurrentVideo(platformHint?: Platform): HTMLVideoElement | null {
    const rankedVideos = getRankedVideos(platformHint);
    if (rankedVideos.length === 0) return null;
    return rankedVideos[0];
}

function detectPlatform(url: string): Platform {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
            return 'youtube';
        }
        if (hostname.includes('netflix.com')) {
            return 'netflix';
        }
    } catch {
        return 'unknown';
    }
    return 'unknown';
}

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) return trimmed;
    }
    return undefined;
}

function getMetaContent(selectors: string[]): string | undefined {
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLMetaElement) {
            const content = element.content?.trim();
            if (content) return content;
        } else if (element instanceof HTMLElement) {
            const text = element.textContent?.trim();
            if (text) return text;
        }
    }
    return undefined;
}

function extractFromPageScripts(patterns: RegExp[]): string | undefined {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
        const text = script.textContent;
        if (!text || text.length > 1_500_000) continue;
        for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match?.[1]) {
                return match[1].trim();
            }
        }
    }
    return undefined;
}

function getYoutubeMediaIdFromUrl(rawUrl: string): string | undefined {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.replace('/', '') || undefined;
        }
        const fromQuery = parsed.searchParams.get('v');
        if (fromQuery) return fromQuery;
    } catch {
        return undefined;
    }
    return undefined;
}

function extractYoutubeMediaId(rawUrl: string): string | undefined {
    const fromUrl = getYoutubeMediaIdFromUrl(rawUrl);
    if (fromUrl) return fromUrl;

    const canonicalHref = (document.querySelector('link[rel=\"canonical\"]') as HTMLLinkElement | null)?.href;
    if (canonicalHref) {
        const fromCanonical = getYoutubeMediaIdFromUrl(canonicalHref);
        if (fromCanonical) return fromCanonical;
    }

    return extractFromPageScripts([
        /"videoId":"([a-zA-Z0-9_-]{6,})"/,
        /videoId['"]?\s*:\s*['"]([a-zA-Z0-9_-]{6,})['"]/,
    ]);
}

function extractNetflixMediaId(rawUrl: string): string | undefined {
    try {
        const parsed = new URL(rawUrl);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const watchIndex = parts.indexOf('watch');
        if (watchIndex !== -1 && parts[watchIndex + 1]) {
            return parts[watchIndex + 1];
        }
    } catch {
        return undefined;
    }

    return extractFromPageScripts([
        /"video_id":\s*"?(\d{4,})"?/,
        /"movieid":\s*"?(\d{4,})"?/i,
    ]);
}

function extractMediaId(rawUrl: string, platform: Platform): string | undefined {
    if (platform === 'youtube') {
        return extractYoutubeMediaId(rawUrl);
    }
    if (platform === 'netflix') {
        return extractNetflixMediaId(rawUrl);
    }
    return undefined;
}

function extractCurrentTitle(platform: Platform): string {
    if (platform === 'youtube') {
        const ytHeading = firstNonEmpty([
            document.querySelector('h1.ytd-watch-metadata')?.textContent,
            document.querySelector('h1.title')?.textContent,
            getMetaContent(["meta[property='og:title']", "meta[name='title']", "meta[itemprop='name']"]),
        ]);
        if (ytHeading) return ytHeading;
    }

    if (platform === 'netflix') {
        const netflixTitle = firstNonEmpty([
            getMetaContent(["meta[property='og:title']", "meta[name='twitter:title']"]),
            document.querySelector('[data-uia=\"video-title\"]')?.textContent,
            document.querySelector('h1')?.textContent,
        ]);
        if (netflixTitle) return netflixTitle;
    }

    const genericTitle = firstNonEmpty([
        getMetaContent(["meta[property='og:title']", "meta[name='twitter:title']", "meta[name='title']"]),
        document.title
    ]);
    return genericTitle || 'Untitled';
}

function getPageInfo(rawUrl: string, platform: Platform): PageInfo {
    const now = Date.now();
    const isSamePage = cachedPageInfo?.url === rawUrl && cachedPageInfo?.platform === platform;
    const isFresh = isSamePage && cachedPageInfo && now - cachedPageInfo.updatedAt < 3000;
    if (isFresh && cachedPageInfo) {
        return cachedPageInfo;
    }

    const mediaId = extractMediaId(rawUrl, platform);
    const title = extractCurrentTitle(platform);
    const info = {
        url: rawUrl,
        platform,
        mediaId,
        title,
        updatedAt: now
    };
    cachedPageInfo = info;
    return info;
}

function detectInAd(platform: Platform): boolean {
    if (platform === 'youtube') {
        const freshState = getFreshYoutubeMainState();
        if (freshState?.watchingAds) return true;
        const player = document.querySelector('.html5-video-player');
        const playerInAd = player?.classList.contains('ad-showing') ?? false;
        const adBadge = document.querySelector('.ytp-ad-text, .ytp-ad-simple-ad-badge, .ytp-ad-preview-container');
        const adBadgeVisible = adBadge instanceof HTMLElement && adBadge.offsetParent !== null;
        return playerInAd || adBadgeVisible;
    }

    if (platform === 'netflix') {
        const freshState = getFreshNetflixMainState();
        if (freshState?.watchingAds) return true;

        // Keep this strict: broad selectors create false positives and block sync commands.
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

        for (const selector of adSelectors) {
            const element = document.querySelector(selector);
            if (element instanceof HTMLElement && element.offsetParent !== null) {
                return true;
            }
        }
        return false;
    }

    return false;
}

function getMediaScore(video: HTMLVideoElement | null, platform: Platform, isPlaying: boolean, inAd: boolean): number {
    if (!video) return 0;

    const rect = video.getBoundingClientRect();
    const area = Math.max(0, rect.width * rect.height);
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = area / viewportArea;

    let score = 0;
    score += Math.min(4.2, areaRatio * 4.6);
    if (isPlaying) score += 1.7;
    if (video.readyState >= 2) score += 0.6;
    if ((video.currentSrc || video.src)) score += 0.4;
    if (!video.muted && video.volume > 0.01) score += 0.3;
    if (platform === 'youtube' || platform === 'netflix') score += 0.4;
    if (inAd) score -= 0.8;

    return Math.max(0, Math.min(10, score));
}

function buildLocalState(reason: LocalStateReason): LocalStateMessage {
    const currentUrl = window.location.href;
    const platform = detectPlatform(currentUrl);
    ensureMainBridgeInjected(platform);
    pollYouTubeMainState(platform);
    pollNetflixMainState(platform);
    const pageInfo = getPageInfo(currentUrl, platform);
    const activeVideo = getCurrentVideo(platform) || (videoElement && videoElement.isConnected ? videoElement : null);
    if (activeVideo) {
        videoElement = activeVideo;
    }
    const youtubePlayer = platform === 'youtube'
        ? document.querySelector('.html5-video-player')
        : null;
    const youtubePlayingFromClass = Boolean(
        youtubePlayer &&
        youtubePlayer.classList.contains('playing-mode') &&
        !youtubePlayer.classList.contains('paused-mode')
    );

    const youtubeState = getFreshYoutubeMainState();
    const netflixState = getFreshNetflixMainState();
    const videoPlaying = Boolean(activeVideo && !activeVideo.paused && !activeVideo.ended);
    const youtubePlaying = platform === 'youtube'
        ? Boolean((youtubeState && !youtubeState.paused && !youtubeState.loading) || (!activeVideo && youtubePlayingFromClass))
        : false;
    const netflixPlaying = platform === 'netflix'
        ? Boolean(netflixState && !netflixState.paused && !netflixState.loading)
        : false;
    const isPlaying = youtubePlaying || netflixPlaying || videoPlaying;
    const inAd = detectInAd(platform);
    const mediaScore = getMediaScore(activeVideo, platform, isPlaying, inAd);
    const playbackTime = getCurrentPlaybackTime(platform, activeVideo);
    return {
        type: 'LOCAL_STATE',
        reason,
        url: currentUrl,
        title: pageInfo.title || document.title || 'Untitled',
        mediaId: pageInfo.mediaId,
        platform,
        time: playbackTime,
        isPlaying,
        playbackRate: getCurrentPlaybackRate(platform, activeVideo),
        inAd,
        mediaScore,
        frameUrl: window.location.href
    };
}

function emitLocalState(reason: LocalStateReason, force = false) {
    const state = buildLocalState(reason);
    const timeBucket = Math.floor(state.time);
    const signature = `${state.url}|${state.mediaId || ''}|${state.title}|${state.isPlaying}|${state.inAd}|${reason === 'tick' ? timeBucket : 'event'}`;

    if (!force && signature === lastSentSignature) {
        return;
    }

    lastSentSignature = signature;
    void safeRuntimeSendMessage(state);
}

function setupVideoSync(video: HTMLVideoElement) {
    if (video.dataset.watchPartyMapped === 'true') {
        videoElement = video;
        return;
    }

    video.dataset.watchPartyMapped = 'true';
    videoElement = video;
    lastTickBucket = Math.floor(video.currentTime);

    console.log('[WatchParty] Video player detected. Sync bridge active.');

    video.addEventListener('play', () => {
        if (Date.now() - lastCommandTime < 550) return;
        emitLocalState('play', true);
    });

    video.addEventListener('pause', () => {
        if (Date.now() - lastCommandTime < 550) return;
        emitLocalState('pause', true);
    });

    video.addEventListener('seeked', () => {
        if (Date.now() - lastCommandTime < 550) return;
        emitLocalState('seek', true);
    });

    video.addEventListener('loadedmetadata', () => {
        emitLocalState('initial', true);
    });

    if (pendingSyncCommand) {
        const commandToApply = pendingSyncCommand;
        pendingSyncCommand = null;
        applySyncCommand(commandToApply);
    }

    emitLocalState('initial', true);
}

function installNavigationTracking() {
    const historyState = history as History & { __watchPartyHooked?: boolean };
    if (historyState.__watchPartyHooked) return;
    historyState.__watchPartyHooked = true;

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = ((...args: Parameters<History['pushState']>) => {
        originalPushState(...args);
        window.setTimeout(() => emitLocalState('navigation', true), 0);
    }) as History['pushState'];

    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
        originalReplaceState(...args);
        window.setTimeout(() => emitLocalState('navigation', true), 0);
    }) as History['replaceState'];

    window.addEventListener('popstate', () => emitLocalState('navigation', true));
    window.addEventListener('hashchange', () => emitLocalState('navigation', true));
    window.addEventListener('yt-navigate-start', () => emitLocalState('navigation', true));
    window.addEventListener('yt-navigate-finish', () => emitLocalState('navigation', true));
}

installNavigationTracking();

setInterval(() => {
    const platform = detectPlatform(window.location.href);
    ensureMainBridgeInjected(platform);
    pollYouTubeMainState(platform);
    pollNetflixMainState(platform);
    if (videoElement && !videoElement.isConnected) {
        videoElement = null;
    }

    const currentVideo = getCurrentVideo(platform);
    if (currentVideo) {
        setupVideoSync(currentVideo);
    }

    const inAd = detectInAd(platform);
    if (inAd !== lastInAdState) {
        lastInAdState = inAd;
        emitLocalState(inAd ? 'ad_start' : 'ad_end', true);
    }

    if (!inAd && pendingSyncCommand && (videoElement || platform === 'youtube' || platform === 'netflix')) {
        const queuedCommand = pendingSyncCommand;
        pendingSyncCommand = null;
        applySyncCommand(queuedCommand);
    }

    if (window.location.href !== lastKnownUrl || document.title !== lastKnownTitle) {
        lastKnownUrl = window.location.href;
        lastKnownTitle = document.title;
        lastObservedPlayingState = null;
        emitLocalState('navigation', true);
    }

    const youtubePlayer = platform === 'youtube'
        ? document.querySelector('.html5-video-player')
        : null;
    const youtubePlayingFromClass = Boolean(
        youtubePlayer &&
        youtubePlayer.classList.contains('playing-mode') &&
        !youtubePlayer.classList.contains('paused-mode')
    );
    const youtubeState = getFreshYoutubeMainState();
    const youtubePlaying = platform === 'youtube' && Boolean(
        (youtubeState && !youtubeState.paused && !youtubeState.loading) ||
        (!videoElement && youtubePlayingFromClass)
    );
    const videoPlaying = Boolean(videoElement && !videoElement.paused && !videoElement.ended);
    const netflixState = getFreshNetflixMainState();
    const netflixPlaying = platform === 'netflix' && netflixState ? !netflixState.paused && !netflixState.loading : false;
    const currentPlaying = netflixPlaying || youtubePlaying || videoPlaying;

    if (lastObservedPlayingState === null) {
        lastObservedPlayingState = currentPlaying;
    } else if (currentPlaying !== lastObservedPlayingState && Date.now() - lastCommandTime >= 360) {
        lastObservedPlayingState = currentPlaying;
        emitLocalState(currentPlaying ? 'play' : 'pause', true);
    }

    if (!videoElement && !(platform === 'youtube' && youtubeState)) return;
    if (Date.now() - lastCommandTime < 700) return;
    if (videoElement && (videoElement.paused || videoElement.ended) && !youtubePlaying) return;

    const tickBucket = Math.floor(getCurrentPlaybackTime(platform, videoElement));
    if (tickBucket !== lastTickBucket) {
        lastTickBucket = tickBucket;
        emitLocalState('tick', true);
    }
}, 320);

function applySyncCommand(message: SyncCommandMessage) {
    if (!videoElement || !videoElement.isConnected) {
        const platform = detectPlatform(window.location.href);
        videoElement = getCurrentVideo(platform);
    }

    const platform = detectPlatform(window.location.href);
    ensureMainBridgeInjected(platform);
    const isNetflix = platform === 'netflix';
    const isYouTube = platform === 'youtube';

    if (!videoElement && !isNetflix && !isYouTube) {
        pendingSyncCommand = message;
        return;
    }

    if (!isNetflix && detectInAd(platform)) {
        pendingSyncCommand = message;
        return;
    }

    if (shouldDropDuplicateSyncCommand(message)) {
        return;
    }

    markSyncCommandApplied(message);
    lastCommandTime = Date.now();

    const playFallback = () => {
        if (!videoElement) return;
        videoElement.play().catch(() => { });
    };
    const pauseFallback = () => {
        if (!videoElement) return;
        videoElement.pause();
    };
    const seekFallback = (timeSeconds: number) => {
        if (!videoElement) return;
        videoElement.currentTime = timeSeconds;
    };
    const setRateFallback = (rate: number) => {
        if (!videoElement) return;
        videoElement.playbackRate = rate;
    };

    const getCurrentPlayingState = () => {
        if (isYouTube) {
            const state = getFreshYoutubeMainState();
            if (state) {
                return !state.paused && !state.loading;
            }
        }
        if (isNetflix) {
            const state = getFreshNetflixMainState();
            if (state) {
                return !state.paused && !state.loading;
            }
        }
        return Boolean(videoElement && !videoElement.paused && !videoElement.ended);
    };

    const setYouTubePlaybackRate = (nextRate: number) => {
        void requestMainBridgeCommand('youtube.rate', { playbackRate: nextRate }, 200).then((response) => {
            if (response?.ok && response.handled) return;
            setRateFallback(nextRate);
        });
    };

    if (message.type === 'SYNC_PLAY') {
        const currentlyPlaying = getCurrentPlayingState();
        if (!currentlyPlaying) {
            if (isNetflix) {
                void requestNetflixMainCommand('play').then((response) => {
                    if (response?.ok && response.handled) return;
                    const handled = safeNetflixPlayPause(true);
                    if (!handled) {
                        playFallback();
                    }
                });
            } else if (isYouTube) {
                void requestMainBridgeCommand('youtube.play', undefined, 220).then((response) => {
                    if (response?.ok && response.handled) return;
                    playFallback();
                });
            } else {
                playFallback();
            }
        }
        lastObservedPlayingState = true;
    } else if (message.type === 'SYNC_PAUSE') {
        const currentlyPlaying = getCurrentPlayingState();
        if (currentlyPlaying) {
            if (isNetflix) {
                void requestNetflixMainCommand('pause').then((response) => {
                    if (response?.ok && response.handled) return;
                    const handled = safeNetflixPlayPause(false);
                    if (!handled) {
                        pauseFallback();
                    }
                });
            } else if (isYouTube) {
                void requestMainBridgeCommand('youtube.pause', undefined, 220).then((response) => {
                    if (response?.ok && response.handled) return;
                    pauseFallback();
                });
            } else {
                pauseFallback();
            }
        }
        lastObservedPlayingState = false;
    } else if (message.type === 'SYNC_SEEK') {
        const currentTime = getCurrentPlaybackTime(platform, videoElement);
        const diff = Math.abs(currentTime - message.time);
        if (diff > 0.35) {
            if (isNetflix) {
                void requestNetflixMainSeek(message.time).then((handledByMainWorld) => {
                    if (handledByMainWorld) return;
                    void Promise.resolve(safeNetflixSeek(message.time));
                });
            } else if (isYouTube) {
                void requestMainBridgeCommand('youtube.seek', { timeSeconds: message.time }, 240).then((response) => {
                    if (response?.ok && response.handled) return;
                    seekFallback(message.time);
                });
            } else {
                seekFallback(message.time);
            }
            lastHardSeekAt = Date.now();
        }
    } else if (message.type === 'SYNC_ALL') {
        const basePlaybackRate = Number.isFinite(message.playbackRate)
            ? Math.max(0.25, Math.min(4, Number(message.playbackRate)))
            : 1;
        const nudgePercent = Number.isFinite(message.nudgePercent)
            ? Math.max(0.0025, Math.min(0.06, Number(message.nudgePercent)))
            : 0.01;
        const isForce = Boolean(message.force);
        const requestedTolerance = Number.isFinite(message.toleranceSeconds)
            ? Math.max(0.1, Number(message.toleranceSeconds))
            : 3.4;
        const hardSeekThreshold = isForce
            ? 0.1
            : Math.max(requestedTolerance, isNetflix ? 0.9 : 0.65);
        const nudgeThreshold = isForce
            ? 0
            : Math.max(0.18, Math.min(0.45, hardSeekThreshold * 0.6));
        const currentTime = getCurrentPlaybackTime(platform, videoElement);
        const signedDelta = message.time - currentTime;
        const diff = Math.abs(signedDelta);
        const now = Date.now();
        const canHardSeek = isForce || now - lastHardSeekAt > (isNetflix ? 1250 : isYouTube ? 780 : 900);
        if (diff > hardSeekThreshold && canHardSeek) {
            if (isNetflix) {
                void requestNetflixMainSeek(message.time).then((handledByMainWorld) => {
                    if (handledByMainWorld) return;
                    void Promise.resolve(safeNetflixSeek(message.time));
                });
                lastHardSeekAt = now;
            } else if (isYouTube) {
                void requestMainBridgeCommand('youtube.seek', { timeSeconds: message.time }, 260).then((response) => {
                    if (response?.ok && response.handled) return;
                    seekFallback(message.time);
                });
                lastHardSeekAt = now;
            } else {
                seekFallback(message.time);
                lastHardSeekAt = now;
            }
        }

        if (isNetflix) {
            // Netflix is sensitive to direct media element mutations (M7375).
            // Keep sync to play/pause + safe seek via internal player only.
            void requestNetflixMainCommand(message.isPlaying ? 'play' : 'pause').then((response) => {
                if (response?.ok && response.handled) return;
                const handled = safeNetflixPlayPause(message.isPlaying);
                if (!handled && videoElement) {
                    const currentlyPlaying = !videoElement.paused && !videoElement.ended;
                    if (message.isPlaying) {
                        if (!currentlyPlaying) {
                            playFallback();
                        }
                    } else if (currentlyPlaying) {
                        pauseFallback();
                    }
                }
            });
            lastObservedPlayingState = message.isPlaying;
            lastHardSeekAt = now;
            return;
        }

        const currentlyPlaying = getCurrentPlayingState();
        if (message.isPlaying) {
            if (!currentlyPlaying) {
                if (isYouTube) {
                    void requestMainBridgeCommand('youtube.play', undefined, 220).then((response) => {
                        if (response?.ok && response.handled) return;
                        playFallback();
                    });
                } else {
                    playFallback();
                }
            }
        } else if (currentlyPlaying) {
            if (isYouTube) {
                void requestMainBridgeCommand('youtube.pause', undefined, 220).then((response) => {
                    if (response?.ok && response.handled) return;
                    pauseFallback();
                });
            } else {
                pauseFallback();
            }
        }
        lastObservedPlayingState = message.isPlaying;

        const isPlayingAfterSync = getCurrentPlayingState();
        if (!message.isPlaying || !isPlayingAfterSync || isForce) {
            const currentRate = getCurrentPlaybackRate(platform, videoElement);
            if (Math.abs(currentRate - basePlaybackRate) > 0.01) {
                if (isYouTube) {
                    setYouTubePlaybackRate(basePlaybackRate);
                } else {
                    setRateFallback(basePlaybackRate);
                }
            }
            return;
        }

        const nudgeNeeded = diff > nudgeThreshold && diff <= hardSeekThreshold;
        if (nudgeNeeded) {
            const multiplier = signedDelta > 0 ? (1 + nudgePercent) : (1 - nudgePercent);
            const nudgedRate = Math.max(0.5, Math.min(2, basePlaybackRate * multiplier));
            const currentRate = getCurrentPlaybackRate(platform, videoElement);
            if (Math.abs(currentRate - nudgedRate) > 0.01) {
                if (isYouTube) {
                    setYouTubePlaybackRate(nudgedRate);
                } else {
                    setRateFallback(nudgedRate);
                }
            }
        } else {
            const currentRate = getCurrentPlaybackRate(platform, videoElement);
            if (Math.abs(currentRate - basePlaybackRate) > 0.01) {
                if (isYouTube) {
                    setYouTubePlaybackRate(basePlaybackRate);
                } else {
                    setRateFallback(basePlaybackRate);
                }
            }
        }
    }
}

if (isRuntimeAvailable()) {
    try {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type === 'WATCHPARTY_PING') {
                sendResponse({ ok: true });
                return true;
            }

            if (message.type === 'GET_MEDIA_STATE') {
                sendResponse(buildLocalState('initial'));
                return true;
            }

            if (message.type === 'WATCHPARTY_SHOW_FLOAT_BUBBLE') {
                if (!IS_TOP_FRAME) {
                    sendResponse({ ok: true });
                    return true;
                }
                applyFloatStatusStatus({ active: true, show: true });
                showRestoreBubbleButton();
                sendResponse({ ok: true });
                return true;
            }

            if (message.type === 'WATCHPARTY_HIDE_FLOAT_BUBBLE') {
                if (!IS_TOP_FRAME) {
                    sendResponse({ ok: true });
                    return true;
                }
                applyFloatStatusStatus({ show: false });
                hideRestoreBubbleButton();
                sendResponse({ ok: true });
                return true;
            }

            if (message.type === 'WATCHPARTY_FLOAT_STATUS') {
                if (!IS_TOP_FRAME) {
                    sendResponse({ ok: true });
                    return true;
                }
                applyFloatStatusStatus({
                    active: Boolean(message.active),
                    show: Boolean(message.show),
                    participants: Number(message.participants) || 0,
                    unread: Number(message.unread) || 0,
                    roomId: typeof message.roomId === 'string' ? message.roomId : null,
                    isHost: Boolean(message.isHost),
                    connected: Boolean(message.connected),
                    requestEmoji: typeof message.requestEmoji === 'string' ? message.requestEmoji : null,
                    requestEmojiExpiresAt: typeof message.requestEmojiExpiresAt === 'number' ? message.requestEmojiExpiresAt : 0
                });
                sendResponse({ ok: true });
                return true;
            }

            if (
                message.type === 'SYNC_PLAY' ||
                message.type === 'SYNC_PAUSE' ||
                message.type === 'SYNC_SEEK' ||
                message.type === 'SYNC_ALL'
            ) {
                applySyncCommand(message as SyncCommandMessage);
            }
        });
    } catch {
        // Ignore listener registration errors on invalidated extension contexts.
    }
}

if (IS_TOP_FRAME) {
    requestFloatingWidgetStatus();
    ensureFloatingWidgetPoll();
    const refreshFloatStatus = () => {
        requestFloatingWidgetStatus();
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshFloatStatus();
        }
    });
    window.addEventListener('focus', refreshFloatStatus);
    document.addEventListener('fullscreenchange', syncRestoreBubbleForFullscreen);
}
    })();
}
})();
