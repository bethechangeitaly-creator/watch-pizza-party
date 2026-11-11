import type { SyncRequestReason, SystemEvent, Timeline } from '@watch-party/shared';

export function formatClock(sec: number): string {
    const safe = Math.max(0, Math.floor(sec));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = String(safe % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function systemEvent(
    kind: SystemEvent['kind'],
    text: string,
    now: number,
    user?: { id: string; username: string },
): SystemEvent {
    return { kind, text, timestamp: now, ...(user ? { userId: user.id, username: user.username } : {}) };
}

export function describeTimelineChange(
    _prev: Timeline | null,
    next: Timeline,
    username: string,
): { kind: SystemEvent['kind']; text: string } | null {
    switch (next.cause) {
        case 'media':
            return { kind: 'media', text: next.title ? `${username} started "${next.title}"` : `${username} started a new video` };
        case 'play':
            return { kind: 'play', text: `${username} pressed play` };
        case 'pause':
            return { kind: 'pause', text: `${username} paused at ${formatClock(next.positionSec)}` };
        case 'seek':
            return { kind: 'seek', text: `${username} jumped to ${formatClock(next.positionSec)}` };
        case 'force':
            return { kind: 'force', text: `${username} synced everyone` };
        default:
            return null;
    }
}

const REQUEST_VERB: Record<Exclude<SyncRequestReason, 'resync'>, string> = {
    pause: 'pause',
    play: 'play',
    back: 'go back',
    forward: 'go forward',
};

export function requestText(reason: SyncRequestReason, username: string): string {
    return reason === 'resync' ? `${username} asked to resync` : `${username} asked the host to ${REQUEST_VERB[reason]}`;
}
