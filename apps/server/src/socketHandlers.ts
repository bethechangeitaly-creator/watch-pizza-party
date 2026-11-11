import type { Server, Socket } from 'socket.io';
import {
    ClientMessageSchema,
    MESSAGE_EVENT,
    PROTOCOL_VERSION,
    UPDATE_REQUIRED_MESSAGE,
    type ClientMessage,
    type ErrorCode,
    type ServerMessage,
} from '@watch-party/shared';
import type { RoomStore } from './roomStore';
import { IP_LIMITS, KeyedLimiter, SOCKET_LIMITS, TokenBucket, clientIp } from './rateLimit';

const ERROR_TEXT: Record<'room_not_found' | 'room_full', string> = {
    room_not_found: 'Room not found. Check the code.',
    room_full: 'This room is full (20 people).',
};

type SocketSession = { roomId: string; userId: string } | null;

const TOO_FAST = "You're doing that too fast.";

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
                            store.removeMember(session.roomId, session.userId);
                            socket.leave(session.roomId);
                            broadcastRoomState(session.roomId);
                        } else {
                            store.detachSocket(session.roomId, session.userId);
                        }
                    }
                    session = { roomId: credentials.roomId, userId: credentials.userId };
                    store.attachSocket(credentials.roomId, credentials.userId);
                    socket.join(credentials.roomId);
                    send(socket, { type: 'room.joined', payload: { ...credentials, resumed } });
                    broadcastRoomState(credentials.roomId);
                    return;
                }
                case 'room.leave': {
                    if (!session) return;
                    const { roomId, userId } = session;
                    session = null;
                    store.removeMember(roomId, userId);
                    socket.leave(roomId);
                    broadcastRoomState(roomId);
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

        socket.on('disconnect', () => {
            if (!session) return;
            store.detachSocket(session.roomId, session.userId);
            broadcastRoomState(session.roomId);
            session = null;
        });
    });

    return { broadcastRoomState };
}
