import { describe, expect, it, vi } from 'vitest';
import type { ClientMessage, Room, ServerMessage } from '@watch-party/shared';
import { SessionController, type ConnectionHandlers, type SessionDeps } from './sessionController';
import { memoryArea } from '../test/memoryArea';

type FakeConnection = { sent: ClientMessage[]; emit(m: ServerMessage): void; status(s: 'connected' | 'disconnected'): void; disconnected: boolean };

function makeController(overrides: Partial<SessionDeps> = {}) {
    const connections: FakeConnection[] = [];
    const deps: SessionDeps = {
        storage: memoryArea(),
        storageKey: 'k',
        now: () => 1000,
        serverUrl: () => 'https://s',
        connectionFactory: (_url: string, handlers: ConnectionHandlers) => {
            const conn: FakeConnection = {
                sent: [],
                disconnected: false,
                emit: (m) => handlers.onMessage(m),
                status: (s) => handlers.onStatus(s),
            };
            connections.push(conn);
            return {
                connect: () => handlers.onStatus('connected'),
                disconnect: () => { conn.disconnected = true; },
                send: (m) => conn.sent.push(m),
                clock: { offsetMs: 250 },
            };
        },
        createRoom: vi.fn(async () => ({ roomId: 'Jol4I72BE4', userId: 'u1', token: 'T'.repeat(24), username: 'Marco', avatarColor: '#FF6A3D' })),
        getTab: async () => ({ title: 'Video' }),
        emit: vi.fn(),
        onTimeline: vi.fn(),
        onEntries: vi.fn(),
        onHostRequest: vi.fn(),
        ...overrides,
    };
    return { controller: new SessionController(deps), deps, connections };
}

const joined = (userId = 'u1', username = 'Luca'): ServerMessage => ({
    type: 'room.joined',
    payload: { roomId: 'Jol4I72BE4', userId, token: 'T'.repeat(24), username, avatarColor: '#3DD68C', resumed: false },
});
const roomState = (hostId: string, participants: Room['participants']): ServerMessage => ({
    type: 'room.state', payload: { id: 'Jol4I72BE4', hostId, participants, timeline: null },
});
const person = (id: string, username: string) => ({ id, username, avatarColor: '#fff', role: 'viewer' as const, joinedAt: 0, status: 'unknown' as const });
const chat = (userId: string): ServerMessage => ({
    type: 'chat.message', payload: { id: `m-${userId}-${Math.random()}`, userId, username: 'x', avatarColor: '#fff', text: 'hi', timestamp: 1 },
});

describe('SessionController', () => {
    it('persists the token from room.joined and resumes with it after restart', async () => {
        const storage = memoryArea();
        const a = makeController({ storage });
        await a.controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        expect(a.connections[0].sent[0]).toEqual({ type: 'room.join', payload: { roomId: 'Jol4I72BE4', username: 'Luca', protocolVersion: 2 } });
        a.connections[0].emit(joined());
        expect(a.controller.state()).toMatchObject({ status: 'joined', me: { userId: 'u1' }, mediaTab: { tabId: 7, title: 'Video' } });

        const b = makeController({ storage });
        await b.controller.restore();
        expect(b.connections[0].sent[0]).toEqual({
            type: 'room.join', payload: { roomId: 'Jol4I72BE4', token: 'T'.repeat(24), username: 'Luca', protocolVersion: 2 },
        });
        expect(b.controller.state().mediaTab).toEqual({ tabId: 7, title: 'Video' });
    });

    it('drops a persisted media tab that no longer exists', async () => {
        const storage = memoryArea();
        const a = makeController({ storage });
        await a.controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        a.connections[0].emit(joined());
        const b = makeController({ storage, getTab: async () => null });
        await b.controller.restore();
        expect(b.controller.state().mediaTab).toBeNull();
    });

    it('creates a room then joins it with the creator token', async () => {
        const { controller, connections } = makeController();
        await controller.create('Marco', 3, 'Song');
        expect(connections[0].sent[0]).toEqual({
            type: 'room.join', payload: { roomId: 'Jol4I72BE4', token: 'T'.repeat(24), username: 'Marco', protocolVersion: 2 },
        });
    });

    it('surfaces create errors', async () => {
        const { controller } = makeController({ createRoom: vi.fn(async () => { throw new Error('boom'); }) });
        await controller.create('Marco', 3, 'Song');
        expect(controller.state()).toMatchObject({ status: 'error', error: { message: 'boom' }, roomId: null });
    });

    it('isHost comes from userId, not username', async () => {
        const { controller, connections } = makeController();
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined('u1', 'Luca'));
        connections[0].emit(roomState('u2', [person('u1', 'Luca'), person('u2', 'Luca')]));
        expect(controller.state().isHost).toBe(false);
        connections[0].emit(roomState('u1', [person('u1', 'Luca'), person('u2', 'Luca')]));
        expect(controller.state().isHost).toBe(true);
    });

    it('room_not_found clears storage and shows the error', async () => {
        const storage = memoryArea();
        const { controller, connections } = makeController({ storage });
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined());
        connections[0].emit({ type: 'error', payload: { code: 'room_not_found', message: 'Room not found. Check the code.' } });
        expect(controller.state()).toMatchObject({ status: 'error', roomId: null, error: { code: 'room_not_found' } });
        expect(storage.data.size).toBe(0);
        expect(connections[0].disconnected).toBe(true);
    });

    it('counts unread from others only while the panel is closed', async () => {
        const { controller, connections } = makeController();
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined('u1'));
        connections[0].emit(chat('u1'));
        expect(controller.state().unread).toBe(0);
        connections[0].emit(chat('u2'));
        expect(controller.state().unread).toBe(1);
        controller.setPanelOpen(true);
        expect(controller.state().unread).toBe(0);
        connections[0].emit(chat('u2'));
        expect(controller.state().unread).toBe(0);
    });

    it('disconnect while joined → reconnecting, then rejoins with token', async () => {
        const { controller, connections } = makeController();
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined());
        connections[0].status('disconnected');
        expect(controller.state().status).toBe('reconnecting');
        connections[0].status('connected');
        expect(connections[0].sent.at(-1)).toMatchObject({ type: 'room.join', payload: { token: 'T'.repeat(24) } });
    });

    it('reports a resumed rejoin so the media tab can re-send its state', async () => {
        const onRejoined = vi.fn();
        const { controller, connections } = makeController({ onRejoined });
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined());
        expect(onRejoined).not.toHaveBeenCalled();
        connections[0].status('disconnected');
        connections[0].status('connected');
        connections[0].emit({ type: 'room.joined', payload: { ...(joined() as { payload: object }).payload, resumed: true } } as ServerMessage);
        expect(onRejoined).toHaveBeenCalledTimes(1);
        expect(controller.state().status).toBe('joined');
    });

    it('forwards timelines, entries and host requests', async () => {
        const { controller, connections, deps } = makeController();
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined('u1'));
        connections[0].emit(roomState('u1', [person('u1', 'Luca')]));
        connections[0].emit({ type: 'chat.history', payload: { messages: [] } });
        expect(deps.onEntries).toHaveBeenCalledWith([], true);
        const timeline = { rev: 2, platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 1, anchorServerMs: 1, rate: 1, paused: false, inAd: false, cause: 'force' } as const;
        connections[0].emit({ type: 'sync.timeline', payload: timeline });
        expect(deps.onTimeline).toHaveBeenCalledWith(timeline, true);
        expect(controller.latestTimeline()).toEqual(timeline);
        connections[0].emit({ type: 'sync.request', payload: { reason: 'pause', userId: 'u2', username: 'B' } });
        expect(deps.onHostRequest).toHaveBeenCalledWith('pause');
        expect(controller.clockOffsetMs()).toBe(250);
    });

    it('leave resets to idle and forgets the session', async () => {
        const storage = memoryArea();
        const { controller, connections } = makeController({ storage });
        await controller.join('Jol4I72BE4', 'Luca', 7, 'Video');
        connections[0].emit(joined());
        await controller.leave();
        expect(connections[0].sent.at(-1)).toEqual({ type: 'room.leave', payload: {} });
        expect(controller.state()).toMatchObject({ status: 'idle', roomId: null, room: null, me: null, mediaTab: null });
        expect(storage.data.size).toBe(0);
    });
});
