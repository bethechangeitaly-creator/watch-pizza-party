import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatClock } from '../src/systemEvents';
import { connectClient, join, postRoom, startTestServer, type TestClient } from './helpers';

let s: Awaited<ReturnType<typeof startTestServer>>;
const clients: TestClient[] = [];
const client = async () => { const c = await connectClient(s.url); clients.push(c); return c; };
let roomId: string;
let token: string;
let hostId: string;
let host: TestClient;

beforeEach(async () => {
    s = await startTestServer();
    const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
    ({ roomId, token, userId: hostId } = room);
    host = await client();
    await join(host, roomId, { token });
});
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await s.close(); });

describe('chat', () => {
    it('late joiner gets chat history in order', async () => {
        host.send({ type: 'chat.send', payload: { text: 'before you came' } });
        await host.waitFor('chat.message');
        host.send({ type: 'chat.send', payload: { text: 'second' } });
        await host.waitFor('chat.message');
        const late = await client();
        await join(late, roomId);
        expect((await late.waitFor('chat.history')).messages.map((m) => m.text)).toEqual(['before you came', 'second']);
    });

    it('history keeps the last 100', async () => {
        for (let i = 0; i < 105; i++) s.app.store.addChatMessage(roomId, hostId, `m${i}`);
        const c = await client();
        await join(c, roomId);
        const h = await c.waitFor('chat.history');
        expect(h.messages).toHaveLength(100);
        expect(h.messages[0].text).toBe('m5');
    });

    it('chat.message carries userId and trims text', async () => {
        host.send({ type: 'chat.send', payload: { text: '  hi  ' } });
        const m = await host.waitFor('chat.message');
        expect(m).toMatchObject({ text: 'hi', userId: hostId, username: 'Marco' });
    });

    it('resume also gets history', async () => {
        host.send({ type: 'chat.send', payload: { text: 'remember me' } });
        await host.waitFor('chat.message');
        const again = await client();
        await join(again, roomId, { token });
        expect((await again.waitFor('chat.history')).messages.map((m) => m.text)).toEqual(['remember me']);
    });

    it('emits join, leave and host change events', async () => {
        const viewer = await client();
        await join(viewer, roomId, { username: 'Luca' });
        expect((await host.waitFor('system.event', (e) => e.kind === 'join')).text).toBe('Luca joined');
        host.send({ type: 'room.leave', payload: {} });
        expect((await viewer.waitFor('system.event', (e) => e.kind === 'leave')).text).toBe('Marco left');
        expect((await viewer.waitFor('system.event', (e) => e.kind === 'host_change')).text).toBe('Luca is now the host');
    });

    it('a resumed join is not announced', async () => {
        const again = await client();
        await join(again, roomId, { token });
        await host.expectNone('system.event', 300);
    });
});

describe('formatClock', () => {
    it('formats m:ss and h:mm:ss', () => {
        expect(formatClock(62)).toBe('1:02');
        expect(formatClock(3725)).toBe('1:02:05');
        expect(formatClock(-3)).toBe('0:00');
    });
});
