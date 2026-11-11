import { extractMedia } from '@watch-party/shared';
import type { PanelRequest, PublicSession } from '../lib/messages';
import type { ActiveTab } from './activeTab';

export type StatusLine = {
    tone: 'ok' | 'warn' | 'muted' | 'danger';
    text: string;
    action?: { label: 'Use this tab' | 'Sync everyone' | 'Resync'; request: PanelRequest };
};

const useTab = (tabId: number): StatusLine['action'] => ({ label: 'Use this tab', request: { type: 'session.useTab', tabId } });

function baseLine(session: PublicSession): StatusLine {
    if (session.isHost) {
        if (!session.room?.timeline) return { tone: 'muted', text: 'Open a YouTube or Netflix video to start watching' };
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
export function statusLine(session: PublicSession, activeTab: ActiveTab | null): StatusLine {
    if (session.status === 'reconnecting') return { tone: 'warn', text: 'Reconnecting…' };

    if (!session.mediaTab) {
        return { tone: 'warn', text: 'Pick a tab to watch in', ...(activeTab ? { action: useTab(activeTab.tabId) } : {}) };
    }

    const line = baseLine(session);
    // A video open in another tab can become the party tab with one click.
    const videoElsewhere = activeTab && activeTab.tabId !== session.mediaTab.tabId && activeTab.url && extractMedia(activeTab.url);
    if (!line.action && videoElsewhere) return { ...line, action: useTab(activeTab.tabId) };
    return line;
}
