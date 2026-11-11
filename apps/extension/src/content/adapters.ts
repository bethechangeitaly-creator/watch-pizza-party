import { extractMedia, type MediaRef, type PlayerSnapshot, type SupportedPlatform } from '@watch-party/shared';
import { callBridge } from './bridge';

export interface PlayerAdapter {
    readonly platform: SupportedPlatform;
    media(): MediaRef | null;
    title(): string | undefined;
    snapshot(): PlayerSnapshot | null;
    play(): void;
    pause(): void;
    seek(sec: number): void;
    setRate(rate: number): void;
}

const NETFLIX_AD_SELECTORS = [
    '[data-uia*="ad-break" i]', '[data-uia*="adbreak" i]', '[data-uia*="ad-countdown" i]',
    '[data-uia*="ad_countdown" i]', '.ad-break', '.adBreak', '.watch-video--ad', '.watch-video--ads',
];

const onlyVideoOf = (media: MediaRef | null, platform: SupportedPlatform) => (media?.platform === platform ? media : null);

export function createYouTubeAdapter(doc: Document, loc: Location): PlayerAdapter {
    const video = () => doc.querySelector<HTMLVideoElement>('video.html5-main-video');
    const viaBridge = (command: Parameters<typeof callBridge>[0], payload?: Record<string, unknown>) =>
        callBridge(command, payload)?.handled === true;
    return {
        platform: 'youtube',
        media: () => onlyVideoOf(extractMedia(loc.href), 'youtube'),
        title: () => doc.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim() || undefined,
        snapshot: () => {
            const v = video();
            if (!v) return null;
            return {
                positionSec: v.currentTime,
                paused: v.paused,
                rate: v.playbackRate,
                buffering: !v.paused && v.readyState < 3,
                inAd: doc.querySelector('#movie_player')?.classList.contains('ad-showing') ?? false,
            };
        },
        play: () => { if (!viaBridge('youtube.play')) void video()?.play().catch(() => {}); },
        pause: () => { if (!viaBridge('youtube.pause')) video()?.pause(); },
        seek: (sec) => {
            if (viaBridge('youtube.seek', { timeSeconds: sec })) return;
            const v = video();
            if (v) v.currentTime = sec;
        },
        setRate: (rate) => {
            if (viaBridge('youtube.rate', { playbackRate: rate })) return;
            const v = video();
            if (v) v.playbackRate = rate;
        },
    };
}

export function createNetflixAdapter(doc: Document, loc: Location): PlayerAdapter {
    const inAd = () => NETFLIX_AD_SELECTORS.some((selector) => {
        const el = doc.querySelector(selector);
        return el instanceof HTMLElement && el.offsetParent !== null;
    });
    return {
        platform: 'netflix',
        media: () => onlyVideoOf(extractMedia(loc.href), 'netflix'),
        title: () => doc.querySelector('[data-uia="video-title"]')?.textContent?.trim() || undefined,
        snapshot: () => {
            const state = callBridge('netflix.state');
            const p = state?.handled ? state.payload : undefined;
            if (p && typeof p.timeSeconds === 'number' && typeof p.paused === 'boolean') {
                return { positionSec: p.timeSeconds, paused: p.paused, rate: 1, buffering: p.loading === true, inAd: p.watchingAds === true || inAd() };
            }
            // Reading the element is safe on Netflix; only writing currentTime breaks its player.
            const v = doc.querySelector<HTMLVideoElement>('video');
            if (!v) return null;
            return { positionSec: v.currentTime, paused: v.paused, rate: 1, buffering: !v.paused && v.readyState < 3, inAd: inAd() };
        },
        play: () => { callBridge('netflix.play'); },
        pause: () => { callBridge('netflix.pause'); },
        seek: (sec) => { callBridge('netflix.seek', { timeSeconds: sec }); },
        setRate: () => {
            // Netflix profile never nudges the rate.
        },
    };
}

export function adapterFor(loc: Location, doc: Document): PlayerAdapter | null {
    const host = loc.hostname.toLowerCase();
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return createYouTubeAdapter(doc, loc);
    if (host === 'netflix.com' || host.endsWith('.netflix.com')) return createNetflixAdapter(doc, loc);
    return null;
}
