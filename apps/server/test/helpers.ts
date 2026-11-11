import type { AddressInfo } from 'net';
import { io, type Socket } from 'socket.io-client';
import { MESSAGE_EVENT, PROTOCOL_VERSION, TIME_EVENT, type ServerMessage } from '@watch-party/shared';
import { createApp, type AppOptions } from '../src/app';

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
type PayloadOf<T extends ServerMessage['type']> = MessageOf<T>['payload'];

export type TestClient = {
    socket: Socket;
    received: ServerMessage[];
    send(msg: unknown): void;
    waitFor<T extends ServerMessage['type']>(type: T, pred?: (p: PayloadOf<T>) => boolean, timeoutMs?: number): Promise<PayloadOf<T>>;
    expectNone(type: ServerMessage['type'], ms?: number): Promise<void>;
    time(): Promise<number>;
    close(): void;
};

export async function startTestServer(opts: AppOptions = {}) {
    const app = createApp({ sweepIntervalMs: 0, ...opts });
    await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = app.httpServer.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}`, app, close: () => app.close() };
}

export async function postRoom(url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${url}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) as any };
}

export async function connectClient(url: string): Promise<TestClient> {
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    const received: ServerMessage[] = [];
    const consumed = new Set<ServerMessage>();
    const waiters = new Set<() => void>();
    socket.on(MESSAGE_EVENT, (msg: ServerMessage) => {
        received.push(msg);
        for (const wake of [...waiters]) wake();
    });
    await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
    });

    const client: TestClient = {
        socket,
        received,
        send: (msg) => { socket.emit(MESSAGE_EVENT, msg); },
        waitFor(type, pred, timeoutMs = 2000) {
            return new Promise((resolve, reject) => {
                const check = () => {
                    const hit = received.find((m) => m.type === type && !consumed.has(m)
                        && (!pred || pred(m.payload as never)));
                    if (!hit) return false;
                    // Cursor semantics: everything of this type up to the hit is now behind us.
                    for (const m of received.slice(0, received.indexOf(hit) + 1)) {
                        if (m.type === type) consumed.add(m);
                    }
                    waiters.delete(check);
                    clearTimeout(timer);
                    resolve(hit.payload as never);
                    return true;
                };
                const timer = setTimeout(() => {
                    waiters.delete(check);
                    reject(new Error(`timed out waiting for ${type}; got: ${received.map((m) => m.type).join(', ')}`));
                }, timeoutMs);
                if (!check()) waiters.add(check);
            });
        },
        async expectNone(type, ms = 300) {
            const before = received.filter((m) => m.type === type).length;
            await new Promise((r) => setTimeout(r, ms));
            const after = received.filter((m) => m.type === type).length;
            if (after !== before) throw new Error(`expected no ${type}, got ${after - before}`);
        },
        time: () => socket.timeout(2000).emitWithAck(TIME_EVENT),
        close: () => { socket.disconnect(); },
    };
    return client;
}

export async function join(client: TestClient, roomId: string, extra: { token?: string; username?: string } = {}) {
    client.send({ type: 'room.join', payload: { roomId, protocolVersion: PROTOCOL_VERSION, ...extra } });
    return client.waitFor('room.joined');
}

export function fakeClock(start = 1_700_000_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
}
