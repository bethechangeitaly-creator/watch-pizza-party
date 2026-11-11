import type { PanelRequest, PublicSession } from '../lib/messages';

export type StatusLine = {
    tone: 'ok' | 'warn' | 'muted' | 'danger';
    text: string;
    action?: { label: 'Use this tab' | 'Sync everyone' | 'Resync'; request: PanelRequest };
};

/** The one-line status under the room header (copy from spec D7). */
export function statusLine(session: PublicSession, activeTabId: number | null): StatusLine {
    if (session.status === 'reconnecting') return { tone: 'warn', text: 'Reconnecting…' };

    if (!session.mediaTab) {
        return {
            tone: 'warn',
            text: 'Pick a tab to watch in',
            ...(activeTabId !== null ? { action: { label: 'Use this tab', request: { type: 'session.useTab', tabId: activeTabId } } } : {}),
        };
    }

    if (session.isHost) {
        const someoneDrifting = session.room?.participants.some((p) => p.id !== session.me?.userId && p.status === 'drifting');
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
