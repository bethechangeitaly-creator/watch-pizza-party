import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UPDATE_REQUIRED_MESSAGE } from '@watch-party/shared';
import { connectClient, join, postRoom, startTestServer, type TestClient } from './helpers';

let s: Awaited<ReturnType<typeof startTestServer>>;
const clients: TestClient[] = [];
const client = async () => { const c = await connectClient(s.url); clients.push(c); return c; };
const createRoom = async (username = 'Marco') => (await postRoom(s.url, { protocolVersion: 2, username })).body;

beforeEach(async () => { s = await startTestServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await s.close(); });

describe('identity', () => {
    it('POST /rooms without protocolVersion → 426', async () => {
        const r = await postRoom(s.url, { hostUsername: 'Marco' });
        expect(r.status).toBe(426);
        expect(r.body).toEqual({ code: 'update_required', error: UPDATE_REQUIRED_MESSAGE });
    });

    it('legacy room.join → update_required', async () => {
        const c = await client();
        c.send({ type: 'room.join', payload: { roomId: 'x', username: 'a' } });
        expect(await c.waitFor('error')).toEqual({ code: 'update_required', message: UPDATE_REQUIRED_MESSAGE });
    });

    it('creator resumes with token and is host', async () => {
        const room = await createRoom();
        const c = await client();
        const joined = await join(c, room.roomId, { token: room.token });
        expect(joined).toMatchObject({ userId: room.userId, resumed: true, username: 'Marco' });
        expect((await c.waitFor('room.state')).hostId).toBe(room.userId);
    });

    it('same name without token = new viewer "Marco 2" (hijack regression)', async () => {
        const room = await createRoom();
        const host = await client();
        const other = await client();
        await join(host, room.roomId, { token: room.token });
        const imp = await join(other, room.roomId, { username: 'Marco' });
        expect(imp.userId).not.toBe(room.userId);
        expect(imp.username).toBe('Marco 2');
        const state = await other.waitFor('room.state', (r) => r.participants.length === 2);
        expect(state.hostId).toBe(room.userId);
        expect(state.participants.find((p) => p.id === imp.userId)?.role).toBe('viewer');
    });

    it("another room's token does not resume", async () => {
        const a = await createRoom('Ann');
        const b = await createRoom('Bob');
        const c = await client();
        const joined = await join(c, b.roomId, { token: a.token, username: 'Ann' });
        expect(joined.resumed).toBe(false);
        expect(joined.userId).not.toBe(a.userId);
    });

    it('unknown room → room_not_found', async () => {
        const c = await client();
        c.send({ type: 'room.join', payload: { roomId: 'nope', protocolVersion: 2 } });
        expect((await c.waitFor('error')).code).toBe('room_not_found');
    });

    it('21st participant → room_full', async () => {
        const room = await createRoom();
        for (let i = 0; i < 19; i++) s.app.store.join(room.roomId, { username: `p${i}` });
        const c = await client();
        c.send({ type: 'room.join', payload: { roomId: room.roomId, protocolVersion: 2 } });
        expect((await c.waitFor('error')).code).toBe('room_full');
    });

    it('room.state never contains tokens', async () => {
        const room = await createRoom();
        const c = await client();
        await join(c, room.roomId, { token: room.token });
        const state = await c.waitFor('room.state');
        expect(JSON.stringify(state)).not.toContain(room.token);
    });

    it('long names are sanitized to 32 chars', async () => {
        const room = await createRoom();
        const c = await client();
        const joined = await join(c, room.roomId, { username: 'x'.repeat(60) });
        expect(joined.username).toHaveLength(32);
    });

    it('invalid messages get invalid_message', async () => {
        const c = await client();
        c.send({ type: 'sync.host_snapshot', payload: {} });
        expect((await c.waitFor('error')).code).toBe('invalid_message');
    });
});
