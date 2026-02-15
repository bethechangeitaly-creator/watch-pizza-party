(() => {
    const INSTALL_KEY = '__watchPizzaPartyBridgeInstalled';
    const READY_KEY = '__watchPizzaPartyBridgeReady';
    const BRIDGE_NAMESPACE = 'watchpizzaparty-bridge-v1';
    const REQUEST_EVENT = 'watchpizzaparty:bridge:request';
    const RESPONSE_EVENT = 'watchpizzaparty:bridge:response';

    const win = window as unknown as Window & Record<string, unknown>;
    if (win[INSTALL_KEY]) return;
    win[INSTALL_KEY] = true;

    type BridgeRequestDetail = {
        namespace: string;
        direction: 'to-page';
        id: number;
        command: string;
        payload?: Record<string, unknown> | null;
    };

    type BridgeResponsePayload = {
        timeSeconds?: number;
        paused?: boolean;
        playbackRate?: number;
        loading?: boolean;
        watchingAds?: boolean;
    };

    type BridgeRouteResult = {
        handled: boolean;
        payload?: BridgeResponsePayload | null;
    };

    type NetflixPlayerLike = {
        play?: () => void;
        pause?: () => void;
        seek?: (timeMs: number) => void;
        getCurrentTime?: () => number;
        getSegmentTime?: () => number;
        getBusy?: () => unknown;
        isPaused?: () => boolean;
    };

    function safeNumber(value: unknown): number | null {
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    function postResponse(id: number, handled: boolean, payload?: BridgeResponsePayload | null) {
        window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
            detail: {
                namespace: BRIDGE_NAMESPACE,
                direction: 'to-content',
                id,
                ok: true,
                handled,
                payload: payload ?? null
            }
        }));
    }

    function getYouTubePlayer(): Record<string, unknown> | null {
        const direct = [
            (window as unknown as { movie_player?: Record<string, unknown> }).movie_player,
            document.getElementById('movie_player') as unknown as Record<string, unknown> | null,
            document.querySelector('#movie_player') as unknown as Record<string, unknown> | null
        ];

        for (const candidate of direct) {
            if (!candidate) continue;
            const hasCurrentTime = typeof candidate.getCurrentTime === 'function';
            const hasSeekTo = typeof candidate.seekTo === 'function';
            if (hasCurrentTime || hasSeekTo) return candidate;
        }

        return null;
    }

    function getYouTubeVideo(): HTMLVideoElement | null {
        const video =
            document.querySelector('video.html5-main-video') ||
            document.querySelector('.html5-video-player video') ||
            document.querySelector('video');
        return video instanceof HTMLVideoElement ? video : null;
    }

    function getYouTubeState(): BridgeResponsePayload {
        const player = getYouTubePlayer();
        const video = getYouTubeVideo();

        const playerState = typeof player?.getPlayerState === 'function'
            ? safeNumber(player.getPlayerState())
            : null;

        const playerTime = typeof player?.getCurrentTime === 'function'
            ? safeNumber(player.getCurrentTime())
            : null;
        const videoTime = safeNumber(video?.currentTime);
        const timeSeconds = Math.max(0, playerTime ?? videoTime ?? 0);

        const playerRate = typeof player?.getPlaybackRate === 'function'
            ? safeNumber(player.getPlaybackRate())
            : null;
        const videoRate = safeNumber(video?.playbackRate);
        const playbackRate = Math.max(0.25, Math.min(4, playerRate ?? videoRate ?? 1));

        const pausedFromState = playerState === null ? null : playerState !== 1 && playerState !== 3;
        const paused = pausedFromState ?? Boolean(video?.paused ?? true);
        const loading = playerState === 3;
        const watchingAds = Boolean(
            document.querySelector('.ad-showing, .ytp-ad-text, .ytp-ad-simple-ad-badge, .ytp-ad-player-overlay')
        );

        return { timeSeconds, paused, playbackRate, loading, watchingAds };
    }

    function handleYouTubeCommand(command: string, payload?: Record<string, unknown> | null): BridgeRouteResult {
        const player = getYouTubePlayer();
        const video = getYouTubeVideo();

        if (command === 'youtube.state') {
            return { handled: true, payload: getYouTubeState() };
        }

        if (command === 'youtube.play') {
            if (typeof player?.playVideo === 'function') {
                player.playVideo();
                return { handled: true };
            }
            if (video) {
                void video.play().catch(() => { /* noop */ });
                return { handled: true };
            }
            return { handled: false };
        }

        if (command === 'youtube.pause') {
            if (typeof player?.pauseVideo === 'function') {
                player.pauseVideo();
                return { handled: true };
            }
            if (video) {
                video.pause();
                return { handled: true };
            }
            return { handled: false };
        }

        if (command === 'youtube.seek') {
            const rawTime = safeNumber(payload?.timeSeconds);
            if (rawTime === null) return { handled: false };
            const nextTime = Math.max(0, rawTime);

            if (typeof player?.seekTo === 'function') {
                player.seekTo(nextTime, true);
                return { handled: true };
            }
            if (video) {
                video.currentTime = nextTime;
                return { handled: true };
            }
            return { handled: false };
        }

        if (command === 'youtube.rate') {
            const rawRate = safeNumber(payload?.playbackRate);
            if (rawRate === null) return { handled: false };
            const nextRate = Math.max(0.25, Math.min(4, rawRate));

            if (typeof player?.setPlaybackRate === 'function') {
                player.setPlaybackRate(nextRate);
                return { handled: true };
            }
            if (video) {
                video.playbackRate = nextRate;
                return { handled: true };
            }
            return { handled: false };
        }

        return { handled: false };
    }

    function getNetflixPlayer(): NetflixPlayerLike | null {
        try {
            const netWindow = window as unknown as {
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

            const api = netWindow.netflix?.appContext?.state?.playerApp?.getAPI?.();
            const videoPlayerApi = api?.videoPlayer;
            const sessionIds = videoPlayerApi?.getAllPlayerSessionIds?.() || [];
            const sessionId = sessionIds[0];
            if (sessionId) {
                const player = videoPlayerApi?.getVideoPlayerBySessionId?.(sessionId);
                if (player) return player;
            }

            const legacyPlayer = netWindow.netflix?.cadmium?.objects?.videoPlayer?.();
            if (legacyPlayer) return legacyPlayer;
        } catch {
            // Ignore Netflix internals access failures.
        }

        return null;
    }

    function getNetflixAdState(): boolean {
        const selectors = [
            '[data-uia*="ad-break" i]',
            '[data-uia*="adbreak" i]',
            '[data-uia*="ad-countdown" i]',
            '[data-uia*="ad_countdown" i]',
            '.ad-break',
            '.adBreak',
            '.watch-video--ad',
            '.watch-video--ads'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el instanceof HTMLElement && el.offsetParent !== null) return true;
        }
        return false;
    }

    function getNetflixState(): BridgeResponsePayload {
        const player = getNetflixPlayer();
        const segmentTime = typeof player?.getSegmentTime === 'function'
            ? safeNumber(player.getSegmentTime())
            : null;
        const currentTime = typeof player?.getCurrentTime === 'function'
            ? safeNumber(player.getCurrentTime())
            : null;
        const rawTimeMs = segmentTime ?? currentTime;
        const timeSeconds = Math.max(0, (rawTimeMs ?? 0) / 1000);
        const paused = typeof player?.isPaused === 'function'
            ? Boolean(player.isPaused())
            : undefined;
        const loading = typeof player?.getBusy === 'function'
            ? player.getBusy() !== null
            : false;

        return {
            timeSeconds,
            paused,
            loading,
            watchingAds: getNetflixAdState()
        };
    }

    function handleNetflixCommand(command: string, payload?: Record<string, unknown> | null): BridgeRouteResult {
        const player = getNetflixPlayer();
        if (!player) {
            return { handled: false };
        }

        if (command === 'netflix.state') {
            return { handled: true, payload: getNetflixState() };
        }

        if (command === 'netflix.seek') {
            if (typeof player.seek !== 'function') return { handled: false };
            const rawTime = safeNumber(payload?.timeSeconds);
            if (rawTime === null) return { handled: false };
            player.seek(Math.max(0, Math.round(rawTime * 1000)));
            return { handled: true };
        }

        if (command === 'netflix.play') {
            if (typeof player.play !== 'function') return { handled: false };
            player.play();
            return { handled: true };
        }

        if (command === 'netflix.pause') {
            if (typeof player.pause !== 'function') return { handled: false };
            player.pause();
            return { handled: true };
        }

        return { handled: false };
    }

    function routeCommand(command: string, payload?: Record<string, unknown> | null): BridgeRouteResult {
        if (command.startsWith('youtube.')) {
            return handleYouTubeCommand(command, payload);
        }

        if (command.startsWith('netflix.')) {
            return handleNetflixCommand(command, payload);
        }

        return { handled: false };
    }

    function onBridgeRequest(event: Event) {
        const customEvent = event as CustomEvent<BridgeRequestDetail>;
        const detail = customEvent.detail;
        if (!detail || detail.namespace !== BRIDGE_NAMESPACE || detail.direction !== 'to-page') return;
        if (typeof detail.id !== 'number' || typeof detail.command !== 'string') return;

        try {
            const result = routeCommand(detail.command, detail.payload ?? null);
            postResponse(detail.id, result.handled, result.payload ?? null);
        } catch {
            postResponse(detail.id, false, null);
        }
    }

    window.addEventListener(REQUEST_EVENT, onBridgeRequest, false);
    win[READY_KEY] = true;
})();
