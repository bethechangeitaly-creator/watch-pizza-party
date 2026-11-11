import { nanoid } from 'nanoid';
import {
    LIMITS,
    generateRandomName,
    sanitizeUsername,
    uniqueDisplayName,
    type ChatMessage,
    type Room,
    type Timeline,
    type User,
} from '@watch-party/shared';

export const DISCONNECT_GRACE_MS = 30_000;
export const ROOM_TTL_MS = 30 * 60_000;

export type Credentials = { roomId: string; userId: string; token: string; username: string; avatarColor: string };
export type JoinOutcome = ({ ok: true; resumed: boolean } & Credentials) | { ok: false; code: 'room_not_found' | 'room_full' };

type Member = { user: User; token: string; sockets: number; leftAt: number | null };

type RoomRecord = {
    id: string;
    hostId: string;
    members: Map<string, Member>;
    tokens: Map<string, string>;
    emptySince: number | null;
    chat: ChatMessage[];
    timeline: Timeline | null;
};

export class RoomStore {
    private readonly rooms = new Map<string, RoomRecord>();

    constructor(private readonly now: () => number = Date.now) {}

    createRoom(username?: string | null): Credentials {
        const record: RoomRecord = {
            id: nanoid(10),
            hostId: '',
            members: new Map(),
            tokens: new Map(),
            emptySince: null,
            chat: [],
            timeline: null,
        };
        this.rooms.set(record.id, record);
        const member = this.addMember(record, username);
        member.user.status = 'reconnecting';
        member.leftAt = this.now();
        return this.credentials(record, member);
    }

    join(roomId: string, opts: { token?: string | null; username?: string | null }): JoinOutcome {
        const record = this.rooms.get(roomId);
        if (!record) return { ok: false, code: 'room_not_found' };

        const resumedId = opts.token ? record.tokens.get(opts.token) : undefined;
        const resumed = resumedId ? record.members.get(resumedId) : undefined;
        if (resumed) return { ok: true, resumed: true, ...this.credentials(record, resumed) };

        if (record.members.size >= LIMITS.maxParticipants) return { ok: false, code: 'room_full' };
        const member = this.addMember(record, opts.username);
        return { ok: true, resumed: false, ...this.credentials(record, member) };
    }

    getPublicRoom(roomId: string): Room | null {
        const record = this.rooms.get(roomId);
        if (!record) return null;
        const participants = [...record.members.values()]
            .map((member) => ({ ...member.user }))
            .sort((a, b) => a.joinedAt - b.joinedAt);
        return { id: record.id, hostId: record.hostId, participants, timeline: record.timeline };
    }

    isHost(roomId: string, userId: string): boolean {
        return this.rooms.get(roomId)?.hostId === userId;
    }

    hasRoom(roomId: string): boolean {
        return this.rooms.has(roomId);
    }

    private addMember(record: RoomRecord, rawName?: string | null): Member {
        const random = generateRandomName();
        const desired = sanitizeUsername(rawName) ?? random.name;
        const taken = [...record.members.values()].map((m) => m.user.username);
        const isFirst = record.members.size === 0;
        const user: User = {
            id: nanoid(8),
            username: uniqueDisplayName(desired, taken),
            avatarColor: random.color,
            role: isFirst ? 'host' : 'viewer',
            joinedAt: this.now(),
            status: 'unknown',
        };
        const member: Member = { user, token: nanoid(24), sockets: 0, leftAt: null };
        record.members.set(user.id, member);
        record.tokens.set(member.token, user.id);
        record.emptySince = null;
        if (isFirst) record.hostId = user.id;
        return member;
    }

    private credentials(record: RoomRecord, member: Member): Credentials {
        return {
            roomId: record.id,
            userId: member.user.id,
            token: member.token,
            username: member.user.username,
            avatarColor: member.user.avatarColor,
        };
    }
}
