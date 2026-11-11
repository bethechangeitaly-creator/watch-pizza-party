import { extractMedia, isPrimeVideoSite } from '@watch-party/shared';
import type { PanelRequest, PublicSession } from '../lib/messages';
import type { ActiveTab } from './activeTab';

export type StatusLine = {
    tone: 'ok' | 'warn' | 'muted' | 'danger';
    text: string;
    /** needsPrime: ask Chrome for Prime Video access (from the click) before sending the request. */
    action?: { label: 'Use this tab' | 'Sync everyone' | 'Resync' | 'Allow Prime Video'; request: PanelRequest; needsPrime?: true };
};

const useTab = (tab: ActiveTab, primeAllowed: boolean): StatusLine['action'] => ({
    label: 'Use this tab',
    request: { type: 'session.useTab', tabId: tab.tabId },
    ...(!primeAllowed && isPrimeVideoSite(tab.url) ? { needsPrime: true as const } : {}),
});

function baseLine(session: PublicSession): StatusLine {
    if (session.isHost) {
        if (!session.room?.timeline) return { tone: 'muted', text: 'Open a video on YouTube, Netflix or Prime Video to start watching' };
        const someoneDrifting = session.room.participants.some((p) => p.id !== session.me?.userId && p.status === 'drifting');
        return {
            tone: 'ok',
            text: "You're the host",
            ...(someoneDrifting ? { action: { label: 'Sync everyone', request: { type: 'sync.force' } } } : {}),
        };
    }
    if (session.mySync === 'ad') return { tone: 'muted', text: "You're in an ad" };
    if (session.room?.timeline?.inAd) return { tone: 'muted', text: "Waiting for the host's ad" };
    switch (session.mySync) {
        case 'synced':
            return { tone: 'ok', text: 'In sync' };
        case 'drifting':
            return { tone: 'warn', text: 'Catching up…', action: { label: 'Resync', request: { type: 'sync.resyncMe' } } };
        case 'buffering':
            return { tone: 'muted', text: 'Buffering…' };
        case 'paused':
            return { tone: 'muted', text: 'Paused' };
        default:
            return { tone: 'muted', text: 'Waiting for the video…' };
    }
}

/** The one-line status under the room header (copy from spec D7). */
export function statusLine(session: PublicSession, activeTab: ActiveTab | null, primeAllowed = true): StatusLine {
    if (session.status === 'reconnecting') return { tone: 'warn', text: 'Reconnecting…' };

    if (!session.mediaTab) {
        return { tone: 'warn', text: 'Pick a tab to watch in', ...(activeTab ? { action: useTab(activeTab, primeAllowed) } : {}) };
    }
    if (!session.isHost && !primeAllowed && session.room?.timeline?.platform === 'prime') {
        return {
            tone: 'warn',
            text: 'Allow Prime Video to follow the host',
            action: { label: 'Allow Prime Video', request: { type: 'sync.resyncMe' }, needsPrime: true },
        };
    }

    if (!session.isHost && session.needsVideoClick) return { tone: 'warn', text: 'Click once on the video to start syncing' };

    const line = baseLine(session);
    // A video open in another tab can become the party tab with one click.
    const videoElsewhere = activeTab && activeTab.tabId !== session.mediaTab.tabId && activeTab.url && extractMedia(activeTab.url);
    if (!line.action && videoElsewhere) return { ...line, action: useTab(activeTab, primeAllowed) };
    return line;
}
