import { canonicalWatchUrl, extractMedia, type Timeline } from '@watch-party/shared';

export type MediaTabRef = { tabId: number; url: string | undefined };
export type NavigationPlan = { action: 'none' } | { action: 'navigate'; tabId: number; url: string; key: string };

const mediaKey = (t: { platform: string; mediaId: string }) => `${t.platform}:${t.mediaId}`;

/**
 * Decides whether the viewer's bound tab must load the host's video.
 * Only ever touches the bound tab, and only ever loads a URL built from a validated id.
 */
export function planViewerNavigation(args: {
    timeline: Timeline | null;
    mediaTab: MediaTabRef | null;
    lastNavigatedKey: string | null;
    force: boolean;
}): NavigationPlan {
    const { timeline, mediaTab } = args;
    if (!timeline || !mediaTab) return { action: 'none' };
    const key = mediaKey(timeline);
    const current = mediaTab.url ? extractMedia(mediaTab.url) : null;
    if (current && mediaKey(current) === key) return { action: 'none' };
    if (key === args.lastNavigatedKey && !args.force) return { action: 'none' };
    return { action: 'navigate', tabId: mediaTab.tabId, url: canonicalWatchUrl(timeline), key };
}

export function shouldAcceptHostEvent(senderTabId: number | undefined, mediaTabId: number | null): boolean {
    return typeof senderTabId === 'number' && mediaTabId !== null && senderTabId === mediaTabId;
}
