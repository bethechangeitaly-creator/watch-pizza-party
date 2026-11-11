import type { Server, Socket } from 'socket.io';
import {
    ClientMessageSchema,
    MESSAGE_EVENT,
    PROTOCOL_VERSION,
    TIME_EVENT,
    UPDATE_REQUIRED_MESSAGE,
    type ClientMessage,
    type ErrorCode,
    type ServerMessage,
} from '@watch-party/shared';
import type { RemovalResult, RoomStore } from './roomStore';
import { describeTimelineChange, requestText, systemEvent } from './systemEvents';
import { IP_LIMITS, KeyedLimiter, SOCKET_LIMITS, TokenBucket, clientIp } from './rateLimit';

const ERROR_TEXT: Record<'room_not_found' | 'room_full', string> = {
    room_not_found: 'Room not found. Check the code.',
    room_full: 'This room is full (20 people).',
};

type SocketSession = { roomId: string; userId: string } | null;

const TOO_FAST = "You're doing that too fast.";
const NOT_HOST = 'Only the host controls playback.';

export function setupSocketHandlers(io: Server, store: RoomStore, deps: { now: () => number }) {
    const ipJoins = new KeyedLimiter(IP_LIMITS.join[0], IP_LIMITS.join[1], deps.now);
    const send = (socket: Socket, msg: ServerMessage) => socket.emit(MESSAGE_EVENT, msg);
    const broadcast = (roomId: string, msg: ServerMessage) => io.to(roomId).emit(MESSAGE_EVENT, msg);
    const sendError = (socket: Socket, code: ErrorCode, message: string) =>
        send(socket, { type: 'error', payload: { code, message } });
    const broadcastRoomState = (roomId: string) => {
        const room = store.getPublicRoom(roomId);
        if (room) broadcast(roomId, { type: 'room.state', payload: room });
    };
    const announce = (roomId: string, kind: Parameters<typeof systemEvent>[0], text: string, user?: { id: string; username: string }) =>
        broadcast(roomId, { type: 'system.event', payload: systemEvent(kind, text, deps.now(), user) });
    const announceRemoval = (roomId: string, removal: RemovalResult | null) => {
        if (!removal) return;
        announce(roomId, 'leave', `${removal.removed.username} left`, removal.removed);
        if (removal.newHost) {
            announce(roomId, 'host_change', `${removal.newHost.username} is now the host`, removal.newHost);
        }
    };
    const leaveRoom = (socket: Socket, roomId: string, userId: string) => {
        const removal = store.removeMember(roomId, userId);
        socket.leave(roomId);
        announceRemoval(roomId, removal);
        broadcastRoomState(roomId);
    };

    io.on('connection', (socket) => {
        let session: SocketSession = null;
        const ip = clientIp(socket.handshake.headers, socket.handshake.address);
        const bucket = (name: keyof typeof SOCKET_LIMITS) =>
            new TokenBucket(SOCKET_LIMITS[name][0], SOCKET_LIMITS[name][1], deps.now);
        const limits = {
            chat: bucket('chat'),
            hostUpdate: bucket('hostUpdate'),
            viewerStatus: bucket('viewerStatus'),
            request: bucket('request'),
            join: bucket('join'),
            time: bucket('time'),
        };

        const handle = (msg: ClientMessage) => {
            switch (msg.type) {
                case 'room.join': {
                    if (!limits.join.take() || !ipJoins.take(ip)) {
                        sendError(socket, 'rate_limited', TOO_FAST);
                        return;
                    }
                    const outcome = store.join(msg.payload.roomId, {
                        token: msg.payload.token,
                        username: msg.payload.username,
                    });
                    if (!outcome.ok) {
                        sendError(socket, outcome.code, ERROR_TEXT[outcome.code]);
                        return;
                    }
                    const { ok: _ok, resumed, ...credentials } = outcome;
                    if (session) {
                        if (session.roomId !== credentials.roomId) {
                            // Joining another room leaves the previous one right away.
                            leaveRoom(socket, session.roomId, session.userId);
                        } else {
                            store.detachSocket(session.roomId, session.userId);
                        }
                    }
                    session = { roomId: credentials.roomId, userId: credentials.userId };
                    socket.data.userId = credentials.userId;
                    store.attachSocket(credentials.roomId, credentials.userId);
                    socket.join(credentials.roomId);
                    send(socket, { type: 'room.joined', payload: { ...credentials, resumed } });
                    send(socket, { type: 'chat.history', payload: { messages: store.getChatHistory(credentials.roomId) } });
                    if (!resumed) {
                        announce(credentials.roomId, 'join', `${credentials.username} joined`,
                            { id: credentials.userId, username: credentials.username });
                    }
                    broadcastRoomState(credentials.roomId);
                    const timeline = store.getTimeline(credentials.roomId);
                    if (timeline) send(socket, { type: 'sync.timeline', payload: timeline });
                    return;
                }
                case 'room.leave': {
                    if (!session) return;
                    const { roomId, userId } = session;
                    session = null;
                    leaveRoom(socket, roomId, userId);
                    return;
                }
                case 'chat.send': {
                    if (!session) return;
                    if (!limits.chat.take()) {
                        sendError(socket, 'rate_limited', TOO_FAST);
                        return;
                    }
                    const message = store.addChatMessage(session.roomId, session.userId, msg.payload.text);
                    if (message) broadcast(session.roomId, { type: 'chat.message', payload: message });
                    return;
                }
                case 'sync.host_update': {
                    if (!session || !limits.hostUpdate.take()) return;
                    const result = store.applyHostUpdate(session.roomId, session.userId, msg.payload);
                    if (!result) {
                        sendError(socket, 'not_host', NOT_HOST);
                        return;
                    }
                    broadcast(session.roomId, { type: 'sync.timeline', payload: result.timeline });
                    const event = describeTimelineChange(result.previous, result.timeline, result.timeline.updatedBy ?? '');
                    if (event) announce(session.roomId, event.kind, event.text);
                    return;
                }
                case 'sync.force': {
                    if (!session || !limits.hostUpdate.take()) return;
                    const timeline = store.forceTimeline(session.roomId, session.userId);
                    if (!timeline) {
                        if (!store.isHost(session.roomId, session.userId)) sendError(socket, 'not_host', NOT_HOST);
                        return;
                    }
                    broadcast(session.roomId, { type: 'sync.timeline', payload: timeline });
                    const event = describeTimelineChange(null, timeline, timeline.updatedBy ?? '');
                    if (event) announce(session.roomId, event.kind, event.text);
                    return;
                }
                case 'sync.viewer_status': {
                    if (!session || !limits.viewerStatus.take()) return;
                    if (store.setViewerStatus(session.roomId, session.userId, msg.payload.state)) {
                        broadcastRoomState(session.roomId);
                    }
                    return;
                }
                case 'sync.request': {
                    if (!session || store.isHost(session.roomId, session.userId)) return;
                    if (!limits.request.take()) {
                        sendError(socket, 'rate_limited', TOO_FAST);
                        return;
                    }
                    const room = store.getPublicRoom(session.roomId);
                    const me = room?.participants.find((p) => p.id === session!.userId);
                    if (!room || !me) return;
                    const { roomId } = session;
                    const request: ServerMessage = {
                        type: 'sync.request',
                        payload: { reason: msg.payload.reason, userId: me.id, username: me.username },
                    };
                    void io.in(roomId).fetchSockets().then((sockets) => {
                        for (const s of sockets) if (s.data.userId === room.hostId) s.emit(MESSAGE_EVENT, request);
                    });
                    announce(roomId, 'request', requestText(msg.payload.reason, me.username), { id: me.id, username: me.username });
                    return;
                }
                default:
                    return;
            }
        };

        socket.on(MESSAGE_EVENT, (raw: unknown) => {
            const candidate = raw as { type?: unknown; payload?: { protocolVersion?: unknown } } | null;
            if (candidate?.type === 'room.join' && candidate.payload?.protocolVersion !== PROTOCOL_VERSION) {
                sendError(socket, 'update_required', UPDATE_REQUIRED_MESSAGE);
                return;
            }
            const parsed = ClientMessageSchema.safeParse(raw);
            if (!parsed.success) {
                sendError(socket, 'invalid_message', 'Invalid message.');
                return;
            }
            handle(parsed.data);
        });

        socket.on(TIME_EVENT, (ack: unknown) => {
            if (typeof ack !== 'function' || !limits.time.take()) return;
            ack(deps.now());
        });

        socket.on('disconnect', () => {
            if (!session) return;
            store.detachSocket(session.roomId, session.userId);
            broadcastRoomState(session.roomId);
            session = null;
        });
    });

    return { broadcastRoomState, announceRemoval };
}
