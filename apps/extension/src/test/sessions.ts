import type { Room, Timeline } from '@watch-party/shared';
import type { PublicSession } from '../lib/messages';

export const me = { id: 'u1', username: 'Luca', avatarColor: '#3DD68C', role: 'viewer' as const, joinedAt: 1, status: 'synced' as const };

export function sessionWith(o: {
    status?: PublicSession['status'];
    mediaTab?: PublicSession['mediaTab'];
    isHost?: boolean;
    mySync?: PublicSession['mySync'];
    driftingViewer?: boolean;
    timelineInAd?: boolean;
    playing?: boolean;
} = {}): PublicSession {
    const participants: Room['participants'] = [{ ...me, role: o.isHost ? 'host' : 'viewer' }];
    participants.push({ id: 'u2', username: 'Marco', avatarColor: '#FF6A3D', role: o.isHost ? 'viewer' : 'host', joinedAt: 0, status: o.driftingViewer ? 'drifting' : 'synced' });
    const timeline: Timeline | null = o.timelineInAd || o.playing
        ? { rev: 1, platform: 'youtube', mediaId: 'dQw4w9WgXcQ', title: 'Song', positionSec: 1, anchorServerMs: 0, rate: 1, paused: false, inAd: !!o.timelineInAd, cause: o.timelineInAd ? 'ad' : 'play' }
        : null;
    return {
        status: o.status ?? 'joined',
        roomId: 'Jol4I72BE4',
        me: { userId: 'u1', username: 'Luca', avatarColor: '#3DD68C' },
        isHost: o.isHost ?? false,
        room: { id: 'Jol4I72BE4', hostId: o.isHost ? 'u1' : 'u2', participants, timeline },
        mediaTab: o.mediaTab === undefined ? { tabId: 1, title: 'Song' } : o.mediaTab,
        mySync: o.mySync ?? null,
        serverUrl: 'https://s',
        error: null,
        volumeGain: 1,
        volumeReady: false,
        unread: 0,
    };
}
