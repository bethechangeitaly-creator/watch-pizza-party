import { canonicalWatchUrl, extractMedia, isSupportedSite, type Timeline } from '@watch-party/shared';

export type MediaTabRef = { tabId: number; url: string | undefined };
export type NavigationPlan = { action: 'none' } | { action: 'navigate'; tabId: number; url: string; key: string };

export const mediaKey = (t: { platform: string; mediaId: string }) => `${t.platform}:${t.mediaId}`;

/**
 * Decides whether the viewer's bound tab must load the host's video. It only ever touches the bound
 * tab, only loads a URL built from a validated id, and never pulls a viewer back who chose to leave:
 * - right after the tab was bound (start/join/"Use this tab"), or on an explicit Resync → navigate;
 * - when the host switches to a new video and the tab is still on YouTube/Netflix/Prime Video → navigate;
 * - otherwise (same video and the viewer wandered off, or the tab is on another site) → leave it.
 */
export function planViewerNavigation(args: {
    timeline: Timeline | null;
    mediaTab: MediaTabRef | null;
    previousKey: string | null;
    justBound: boolean;
    force: boolean;
}): NavigationPlan {
    const { timeline, mediaTab } = args;
    if (!timeline || !mediaTab) return { action: 'none' };
    const key = mediaKey(timeline);
    const current = mediaTab.url ? extractMedia(mediaTab.url) : null;
    if (current && mediaKey(current) === key) return { action: 'none' };
    const hostChangedVideo = key !== args.previousKey && isSupportedSite(mediaTab.url);
    if (!args.force && !args.justBound && !hostChangedVideo) return { action: 'none' };
    return { action: 'navigate', tabId: mediaTab.tabId, url: canonicalWatchUrl(timeline), key };
}

export function shouldAcceptHostEvent(senderTabId: number | undefined, mediaTabId: number | null): boolean {
    return typeof senderTabId === 'number' && mediaTabId !== null && senderTabId === mediaTabId;
}

// ── Prime Video: one film, two ids ────────────────────────────────────────────
// Prime may send the link we give viewers (primevideo.com/detail/<host id>) on to a local page with
// another id for the same film (another country's id, or an Amazon store's ASIN). Right after we sent
// the tab there, a different Prime id means "same film": remember it so the viewer still follows.

export type PrimeNav = { hostMediaId: string; atMs: number };
export type PrimeAlias = { hostMediaId: string; viewerMediaId: string };

const ALIAS_WINDOW_MS = 60_000;

export function learnPrimeAlias(args: { nav: PrimeNav | null; nowMs: number; timeline: Timeline; tabUrl: string | undefined }): PrimeAlias | null {
    const { nav, timeline } = args;
    if (!nav || timeline.platform !== 'prime' || nav.hostMediaId !== timeline.mediaId) return null;
    if (args.nowMs - nav.atMs > ALIAS_WINDOW_MS) return null;
    const current = args.tabUrl ? extractMedia(args.tabUrl) : null;
    if (current?.platform !== 'prime' || current.mediaId === timeline.mediaId) return null;
    return { hostMediaId: timeline.mediaId, viewerMediaId: current.mediaId };
}

/** The timeline as the viewer's tab knows the film (only when the alias is for this film). */
export function applyPrimeAlias(timeline: Timeline, alias: PrimeAlias | null): Timeline {
    return alias && timeline.platform === 'prime' && timeline.mediaId === alias.hostMediaId
        ? { ...timeline, mediaId: alias.viewerMediaId }
        : timeline;
}
