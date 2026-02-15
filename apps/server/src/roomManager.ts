import { nanoid } from 'nanoid';
import { Room, User, ChatMessage, generateRandomName, SyncProfile } from '@watch-party/shared';

type InitialMediaState = {
    url?: string;
    title?: string;
    platform?: 'youtube' | 'netflix' | 'unknown';
    syncProfile?: SyncProfile;
    timeSeconds?: number;
    isPlaying?: boolean;
};

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private messages: Map<string, ChatMessage[]> = new Map();

    private pickNextHost(room: Room): User | null {
        if (room.participants.length === 0) return null;

        // Priority: earliest join timestamp, then insertion order fallback.
        let nextHost = room.participants[0];
        for (const participant of room.participants) {
            if (participant.joinedAt < nextHost.joinedAt) {
                nextHost = participant;
            }
        }
        return nextHost;
    }

    private normalizeHost(room: Room) {
        const nextHost = this.pickNextHost(room);
        if (!nextHost) return;

        room.hostId = nextHost.id;
        room.participants = room.participants.map((participant) => ({
            ...participant,
            role: participant.id === nextHost.id ? 'host' : 'viewer'
        }));
    }

    createRoom(hostUsername?: string, initialMedia?: InitialMediaState): { roomId: string; hostId: string; username: string } {
        const roomId = nanoid(10);
        const hostId = nanoid(8);
        const now = Date.now();
        const safeInitialTime =
            typeof initialMedia?.timeSeconds === 'number' && Number.isFinite(initialMedia.timeSeconds)
                ? Math.max(0, initialMedia.timeSeconds)
                : 0;

        const randomInfo = generateRandomName();
        const username = hostUsername?.trim() || randomInfo.name;

        const host: User = {
            id: hostId,
            username,
            avatarColor: randomInfo.color,
            role: 'host',
            joinedAt: now
        };

        const room: Room = {
            id: roomId,
            hostId,
            participants: [host],
            currentUrl: initialMedia?.url?.trim() || '',
            currentTitle: initialMedia?.title?.trim() || '',
            currentPlatform: initialMedia?.platform || 'unknown',
            syncProfile: initialMedia?.syncProfile || 'other',
            referenceTimeSeconds: safeInitialTime,
            referenceUpdatedAt: now,
            isPlaying: Boolean(initialMedia?.isPlaying),
            lastActivity: now
        };

        this.rooms.set(roomId, room);
        this.messages.set(roomId, []);

        return { roomId, hostId, username };
    }

    joinRoom(roomId: string, userUsername?: string): { userId: string; username: string } | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const randomInfo = generateRandomName();
        const username = userUsername?.trim() || randomInfo.name;

        // Prevent duplicates by username
        const existing = room.participants.find(p => p.username === username);
        if (existing) return { userId: existing.id, username: existing.username };

        const userId = nanoid(8);
        const newUser: User = {
            id: userId,
            username,
            avatarColor: randomInfo.color,
            role: room.participants.length === 0 ? 'host' : 'viewer',
            joinedAt: Date.now()
        };

        room.participants.push(newUser);
        this.normalizeHost(room);
        room.lastActivity = Date.now();

        return { userId, username };
    }

    updateUrl(roomId: string, media: {
        url: string;
        title?: string;
        platform?: 'youtube' | 'netflix' | 'unknown';
        syncProfile?: SyncProfile;
        timeSeconds?: number;
        isPlaying?: boolean;
    }) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const now = Date.now();
        let referenceChanged = false;
        room.currentUrl = media.url;
        if (typeof media.title === 'string') {
            room.currentTitle = media.title;
        }
        if (typeof media.platform === 'string') {
            room.currentPlatform = media.platform;
        }
        if (typeof media.syncProfile === 'string') {
            room.syncProfile = media.syncProfile;
        }
        if (typeof media.timeSeconds === 'number') {
            room.referenceTimeSeconds = media.timeSeconds;
            referenceChanged = true;
        }
        if (typeof media.isPlaying === 'boolean') {
            room.isPlaying = media.isPlaying;
            referenceChanged = true;
        }
        if (referenceChanged) {
            room.referenceUpdatedAt = now;
        }
        room.lastActivity = now;
    }

    leaveRoom(roomId: string, userId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const index = room.participants.findIndex(p => p.id === userId);
        if (index === -1) return;

        console.log(`[RoomManager] Removal: "${room.participants[index].username}" leaving #${roomId}`);
        const leavingUser = room.participants[index];
        const wasHost = leavingUser.id === room.hostId || leavingUser.role === 'host';
        room.participants.splice(index, 1);

        if (room.participants.length > 0) {
            const previousHostId = room.hostId;
            this.normalizeHost(room);
            if (previousHostId !== room.hostId) {
                const newHost = room.participants.find((participant) => participant.id === room.hostId);
                if (newHost) {
                    console.log(`[RoomManager] Host migration in #${roomId}: New Host is ${newHost.username}`);
                }
            } else if (wasHost) {
                // Safety fallback if role/hostId drifted.
                const newHost = room.participants.find((participant) => participant.id === room.hostId);
                if (newHost) {
                    console.log(`[RoomManager] Host migration in #${roomId}: New Host is ${newHost.username}`);
                }
            }
        }

        // We DO NOT delete the room immediately. 
        // We update the lastActivity so the system knows it's still "alive" but empty for now.
        room.lastActivity = Date.now();
        console.log(`[RoomManager] Status for #${roomId}: ${room.participants.length} users remaining. Linger mode active.`);
    }

    // New method to cleanup old rooms (can be called periodically)
    cleanupRooms() {
        const now = Date.now();
        const EXPIRY = 5 * 60 * 1000; // 5 minutes grace period

        for (const [id, room] of this.rooms.entries()) {
            if (room.participants.length === 0 && (now - room.lastActivity) > EXPIRY) {
                console.log(`[RoomManager] EXPIRING room #${id} due to inactivity (5m+)`);
                this.rooms.delete(id);
                this.messages.delete(id);
            }
        }
    }

    getRoom(roomId: string): Room | null {
        return this.rooms.get(roomId) || null;
    }

    addMessage(roomId: string, userId: string, username: string, avatarColor: string, text: string): ChatMessage | null {
        if (!this.rooms.has(roomId)) return null;

        const message: ChatMessage = {
            id: nanoid(12),
            roomId,
            userId,
            username,
            avatarColor,
            text,
            timestamp: Date.now()
        };

        const msgs = this.messages.get(roomId) || [];
        msgs.push(message);
        if (msgs.length > 100) msgs.shift();
        this.messages.set(roomId, msgs);

        return message;
    }

    updateReferenceTime(roomId: string, timeSeconds: number) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        room.referenceTimeSeconds = timeSeconds;
        const now = Date.now();
        room.referenceUpdatedAt = now;
        room.lastActivity = now;
    }

    updatePlaybackState(roomId: string, isPlaying: boolean, timeSeconds?: number) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const now = Date.now();
        room.isPlaying = isPlaying;
        if (typeof timeSeconds === 'number') {
            room.referenceTimeSeconds = timeSeconds;
        }
        room.referenceUpdatedAt = now;
        room.lastActivity = now;
    }
}
