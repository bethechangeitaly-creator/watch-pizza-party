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

export type RemovalResult = { removed: User; newHost: User | null };
export type SweepResult = {
    changedRoomIds: string[];
    deletedRoomIds: string[];
    removals: Array<{ roomId: string } & RemovalResult>;
};

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

    attachSocket(roomId: string, userId: string): void {
        const member = this.rooms.get(roomId)?.members.get(userId);
        if (!member) return;
        member.sockets += 1;
        member.leftAt = null;
        if (member.user.status === 'reconnecting') member.user.status = 'unknown';
    }

    detachSocket(roomId: string, userId: string): void {
        const member = this.rooms.get(roomId)?.members.get(userId);
        if (!member) return;
        member.sockets = Math.max(0, member.sockets - 1);
        if (member.sockets === 0) {
            member.leftAt = this.now();
            member.user.status = 'reconnecting';
        }
    }

    /** Removes a member now. Returns what happened so callers can announce it. */
    removeMember(roomId: string, userId: string): RemovalResult | null {
        const record = this.rooms.get(roomId);
        const member = record?.members.get(userId);
        if (!record || !member) return null;
        record.members.delete(userId);
        record.tokens.delete(member.token);

        let newHost: User | null = null;
        if (record.hostId === userId) {
            newHost = this.migrateHost(record);
        }
        if (record.members.size === 0) {
            record.emptySince = this.now();
        }
        return { removed: member.user, newHost };
    }

    /** Drops members whose grace has expired and deletes rooms that stayed empty for the TTL. */
    sweep(): SweepResult {
        const now = this.now();
        const result: SweepResult = { changedRoomIds: [], deletedRoomIds: [], removals: [] };
        for (const record of [...this.rooms.values()]) {
            let changed = false;
            for (const member of [...record.members.values()]) {
                if (member.sockets === 0 && member.leftAt !== null && now - member.leftAt >= DISCONNECT_GRACE_MS) {
                    const removal = this.removeMember(record.id, member.user.id);
                    if (removal) result.removals.push({ roomId: record.id, ...removal });
                    changed = true;
                }
            }
            if (record.members.size === 0) {
                if (record.emptySince === null) record.emptySince = now;
                if (now - record.emptySince >= ROOM_TTL_MS) {
                    this.rooms.delete(record.id);
                    result.deletedRoomIds.push(record.id);
                    continue;
                }
            }
            if (changed) result.changedRoomIds.push(record.id);
        }
        return result;
    }

    addChatMessage(roomId: string, userId: string, text: string): ChatMessage | null {
        const record = this.rooms.get(roomId);
        const member = record?.members.get(userId);
        if (!record || !member) return null;
        const message: ChatMessage = {
            id: nanoid(12),
            userId,
            username: member.user.username,
            avatarColor: member.user.avatarColor,
            text,
            timestamp: this.now(),
        };
        record.chat.push(message);
        if (record.chat.length > LIMITS.historySize) record.chat.splice(0, record.chat.length - LIMITS.historySize);
        return message;
    }

    getChatHistory(roomId: string): ChatMessage[] {
        return [...(this.rooms.get(roomId)?.chat ?? [])];
    }

    isHost(roomId: string, userId: string): boolean {
        return this.rooms.get(roomId)?.hostId === userId;
    }

    hasRoom(roomId: string): boolean {
        return this.rooms.has(roomId);
    }

    private migrateHost(record: RoomRecord): User | null {
        const members = [...record.members.values()].sort((a, b) => a.user.joinedAt - b.user.joinedAt);
        const next = members.find((m) => m.sockets > 0) ?? members[0];
        record.hostId = next?.user.id ?? '';
        for (const member of members) member.user.role = member === next ? 'host' : 'viewer';
        return next?.user ?? null;
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
