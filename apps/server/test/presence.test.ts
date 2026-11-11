import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectClient, fakeClock, join, postRoom, startTestServer, type TestClient } from './helpers';

let s: Awaited<ReturnType<typeof startTestServer>>;
let clock: ReturnType<typeof fakeClock>;
const clients: TestClient[] = [];
const client = async () => { const c = await connectClient(s.url); clients.push(c); return c; };

let roomId: string;
let token: string;
let hostId: string;
let viewerId: string;
let host: TestClient;
let viewer: TestClient;

const statusOf = (userId: string) => s.app.store.getPublicRoom(roomId)?.participants.find((p) => p.id === userId)?.status;

beforeEach(async () => {
    clock = fakeClock();
    s = await startTestServer({ now: clock.now });
    const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
    ({ roomId, token, userId: hostId } = room);
    host = await client();
    await join(host, roomId, { token });
    clock.advance(1000);
    viewer = await client();
    viewerId = (await join(viewer, roomId, { username: 'Luca' })).userId;
});
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await s.close(); });

describe('presence', () => {
    it('host disconnect within grace keeps role, shows reconnecting', async () => {
        expect(statusOf(hostId)).not.toBe('reconnecting');
        host.close();
        const st = await viewer.waitFor('room.state', (r) => r.participants.some((p) => p.id === hostId && p.status === 'reconnecting'));
        expect(st.hostId).toBe(hostId);
        clock.advance(10_000);
        s.app.runSweep();
        expect(s.app.store.getPublicRoom(roomId)?.hostId).toBe(hostId);
        expect(statusOf(hostId)).toBe('reconnecting');
    });

    it('host resumes within grace → same id, still host', async () => {
        host.close();
        await viewer.waitFor('room.state', (r) => r.participants.some((p) => p.id === hostId && p.status === 'reconnecting'));
        clock.advance(20_000);
        s.app.runSweep();
        const back = await client();
        const j = await join(back, roomId, { token });
        expect(j).toMatchObject({ userId: hostId, resumed: true });
        const st = await back.waitFor('room.state');
        expect(st.hostId).toBe(hostId);
        expect(st.participants.find((p) => p.id === hostId)?.status).not.toBe('reconnecting');
    });

    it('after grace the earliest connected viewer becomes host', async () => {
        host.close();
        await viewer.waitFor('room.state', (r) => r.participants.some((p) => p.id === hostId && p.status === 'reconnecting'));
        clock.advance(30_001);
        s.app.runSweep();
        const st = await viewer.waitFor('room.state', (r) => r.hostId === viewerId);
        expect(st.participants.map((p) => p.id)).toEqual([viewerId]);
        expect(st.participants[0].role).toBe('host');
    });

    it('two sockets on one token: member stays while one is connected', async () => {
        const second = await client();
        await join(second, roomId, { token });
        second.close();
        await vi.waitFor(() => expect(s.app.store.getPublicRoom(roomId)).toBeTruthy());
        await new Promise((r) => setTimeout(r, 100));
        clock.advance(31_000);
        s.app.runSweep();
        expect(statusOf(hostId)).not.toBe('reconnecting');
        expect(s.app.store.getPublicRoom(roomId)?.hostId).toBe(hostId);
    });

    it('switching rooms removes you from the first room immediately', async () => {
        await host.waitFor('room.state', (r) => r.participants.some((p) => p.id === viewerId));
        const other = (await postRoom(s.url, { protocolVersion: 2, username: 'Bea' })).body;
        await join(viewer, other.roomId);
        const st = await host.waitFor('room.state', (r) => !r.participants.some((p) => p.id === viewerId));
        expect(st.participants).toHaveLength(1);
    });

    it('room.leave removes immediately and migrates host', async () => {
        host.send({ type: 'room.leave', payload: {} });
        const st = await viewer.waitFor('room.state', (r) => r.hostId === viewerId);
        expect(st.participants.map((p) => p.id)).toEqual([viewerId]);
    });

    it('empty room is deleted after 30 min and all its data is gone', async () => {
        host.close();
        viewer.close();
        await vi.waitFor(() => expect(statusOf(hostId)).toBe('reconnecting'));
        await vi.waitFor(() => expect(statusOf(viewerId)).toBe('reconnecting'));
        clock.advance(30_001);
        s.app.runSweep();
        expect(s.app.store.hasRoom(roomId)).toBe(true);
        expect(s.app.store.getPublicRoom(roomId)?.participants).toEqual([]);
        clock.advance(30 * 60_000);
        s.app.runSweep();
        expect(s.app.store.hasRoom(roomId)).toBe(false);
        const c = await client();
        c.send({ type: 'room.join', payload: { roomId, token, protocolVersion: 2 } });
        expect((await c.waitFor('error')).code).toBe('room_not_found');
    });

    it('a created room nobody joins expires', async () => {
        const lonely = (await postRoom(s.url, { protocolVersion: 2 })).body;
        clock.advance(30_001);
        s.app.runSweep();
        clock.advance(30 * 60_000);
        s.app.runSweep();
        expect(s.app.store.hasRoom(lonely.roomId)).toBe(false);
    });
});
