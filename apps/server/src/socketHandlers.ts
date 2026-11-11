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

const ERROR_TEXT: Record<'room_not_found' | 'room_full', string> = {
    room_not_found: 'Room not found. Check the code.',
    room_full: 'This room is full (20 people).',
};

type SocketSession = { roomId: string; userId: string } | null;

export function setupSocketHandlers(io: Server, store: RoomStore, _deps: { now: () => number }) {
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

        const handle = (msg: ClientMessage) => {
            switch (msg.type) {
                case 'room.join': {
                    const outcome = store.join(msg.payload.roomId, {
                        token: msg.payload.token,
                        username: msg.payload.username,
                    });
                    if (!outcome.ok) {
                        sendError(socket, outcome.code, ERROR_TEXT[outcome.code]);
                        return;
                    }
                    const { ok: _ok, resumed, ...credentials } = outcome;
                    session = { roomId: credentials.roomId, userId: credentials.userId };
                    socket.join(credentials.roomId);
                    send(socket, { type: 'room.joined', payload: { ...credentials, resumed } });
                    broadcastRoomState(credentials.roomId);
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
    });
}
