import type { SystemEvent } from '@watch-party/shared';

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
