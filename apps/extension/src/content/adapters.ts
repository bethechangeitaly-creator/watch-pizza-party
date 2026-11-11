import { extractMedia, isSupportedSite, type MediaRef, type PlayerSnapshot, type SupportedPlatform } from '@watch-party/shared';
import { callBridge } from './bridge';
import { PrimeClock } from './primeClock';

export interface PlayerAdapter {
    readonly platform: SupportedPlatform;
    media(): MediaRef | null;
    title(): string | undefined;
    snapshot(): PlayerSnapshot | null;
    play(): void;
    pause(): void;
    seek(sec: number): void;
    setRate(rate: number): void;
    /** Opens the player when the page has one but it isn't showing (Prime Video detail pages). */
    open?(): void;
    /** True while the viewer must click the video once before jumps can be trusted (Prime Video). */
    needsUserClick?(): boolean;
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

// ── Prime Video ───────────────────────────────────────────────────────────────
// Measured on primevideo.com: the episode is the <video> inside #dv-web-player (a trailer may play
// elsewhere on the page); play/pause/currentTime work on the element (seeking needs a moment to
// load); ads are stitched into the same element and show ".atvwebplayersdk-ad-timer-remaining-time".

const PRIME_AD_TIMER = '.atvwebplayersdk-ad-timer-remaining-time';
const CLOCK_TEXT = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/;

export function parseClock(text: string | null | undefined): number | null {
    const m = text?.match(CLOCK_TEXT);
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

const isShown = (el: Element) => {
    const html = el as HTMLElement;
    return html.getClientRects().length > 0 && html.offsetHeight > 0;
};

export function createPrimeAdapter(doc: Document, loc: Location, visible: (el: Element) => boolean = isShown): PlayerAdapter {
    const clock = new PrimeClock();
    let lastTitle: string | undefined;
    let titleFor: string | null = null; // which video lastTitle belongs to
    let lastOpenAt = -Infinity;

    const player = () => {
        const root = doc.querySelector('#dv-web-player');
        if (!root || !visible(root)) return null;
        const videos = [...root.querySelectorAll('video')].filter((v) => Number.isFinite(v.duration) && v.duration > 0);
        return videos.sort((a, b) => b.duration - a.duration)[0] ?? null;
    };
    const elapsedLabel = () => {
        const root = doc.querySelector('#dv-web-player');
        if (!root) return null;
        for (const el of root.querySelectorAll('span, div')) {
            if (el.children.length > 0 || el.matches(PRIME_AD_TIMER)) continue;
            const sec = parseClock(el.textContent);
            if (sec !== null) return sec; // the elapsed time comes first, the remaining time after it
        }
        return null;
    };
    const read = () => {
        const v = player();
        if (!v) return null;
        const ad = doc.querySelector(PRIME_AD_TIMER);
        const adRemainingSec = ad && visible(ad) ? parseClock(ad.textContent) : null;
        clock.observe({
            streamSec: v.currentTime,
            durationSec: v.duration,
            adRemainingSec,
            labelElapsedSec: adRemainingSec === null ? elapsedLabel() : null,
        });
        const videoKey = `${loc.href.match(/detail\/[^/?]+/)?.[0] ?? ''}|${Math.round(v.duration)}`;
        if (videoKey !== titleFor) {
            titleFor = videoKey;
            lastTitle = undefined; // another film: don't report the previous one's title
        }
        const title = doc.querySelector('.atvwebplayersdk-title-text')?.textContent?.trim();
        const episode = (doc.querySelector('.atvwebplayersdk-subtitle-text') ?? doc.querySelector('.atvwebplayersdk-episode-info'))?.textContent?.trim();
        if (title) lastTitle = episode ? `${title} · ${episode}` : title;
        return { v, inAd: adRemainingSec !== null };
    };

    return {
        platform: 'prime',
        media: () => onlyVideoOf(extractMedia(loc.href), 'prime'),
        title: () => lastTitle ?? (doc.title.replace(/^Prime Video:\s*/i, '').trim() || undefined),
        snapshot: () => {
            const r = read();
            if (!r) return null;
            const { v } = r;
            return { positionSec: clock.toContent(v.currentTime), paused: v.paused, rate: 1, buffering: !v.paused && v.readyState < 3, inAd: r.inAd };
        },
        play: () => { void player()?.play().catch(() => {}); },
        pause: () => { player()?.pause(); },
        seek: (sec) => {
            const v = player();
            if (v) v.currentTime = clock.toStream(sec);
        },
        setRate: () => {
            // Prime profile never nudges the rate.
        },
        needsUserClick: () => !clock.calibrated,
        open: () => {
            if (player() || Date.now() - lastOpenAt < 5000) return;
            lastOpenAt = Date.now();
            doc.querySelector<HTMLElement>('[data-testid="dp-atf-play-button"]')?.click();
        },
    };
}

export function adapterFor(loc: Location, doc: Document): PlayerAdapter | null {
    const host = loc.hostname.toLowerCase();
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return createYouTubeAdapter(doc, loc);
    if (host === 'netflix.com' || host.endsWith('.netflix.com')) return createNetflixAdapter(doc, loc);
    if (isSupportedSite(loc.href) && !host.includes('youtube') && !host.includes('netflix')) return createPrimeAdapter(doc, loc);
    return null;
}
