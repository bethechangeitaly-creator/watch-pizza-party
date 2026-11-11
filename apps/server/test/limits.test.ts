import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectClient, fakeClock, join, postRoom, startTestServer, type TestClient } from './helpers';

let s: Awaited<ReturnType<typeof startTestServer>>;
const clients: TestClient[] = [];
const client = async () => { const c = await connectClient(s.url); clients.push(c); return c; };
let host: TestClient;
let viewer: TestClient;

beforeEach(async () => {
    s = await startTestServer({ now: fakeClock().now, trustProxy: true });
    const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
    host = await client();
    await join(host, room.roomId, { token: room.token });
    viewer = await client();
    await join(viewer, room.roomId, { username: 'Luca' });
});
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await s.close(); });

describe('limits', () => {
    it('broadcasts a normal chat message', async () => {
        host.send({ type: 'chat.send', payload: { text: 'hello' } });
        expect((await viewer.waitFor('chat.message')).text).toBe('hello');
    });

    it('oversized frame never reaches the room', async () => {
        host.send({ type: 'chat.send', payload: { text: 'A'.repeat(20_000) } });
        await viewer.expectNone('chat.message', 500);
    });

    it('6th chat message within a second is rate limited', async () => {
        for (let i = 0; i < 6; i++) host.send({ type: 'chat.send', payload: { text: `m${i}` } });
        expect((await host.waitFor('error')).code).toBe('rate_limited');
        await new Promise((r) => setTimeout(r, 200));
        expect(viewer.received.filter((m) => m.type === 'chat.message')).toHaveLength(5);
    });

    it('11th room creation from one IP in a minute → 429', async () => {
        const headers = { 'x-forwarded-for': '9.9.9.9' };
        for (let i = 0; i < 10; i++) {
            expect((await postRoom(s.url, { protocolVersion: 2 }, headers)).status).toBe(200);
        }
        const r = await postRoom(s.url, { protocolVersion: 2 }, headers);
        expect(r.status).toBe(429);
        expect(r.body).toEqual({ code: 'rate_limited' });
    });

    it('forged X-Forwarded-For does not bypass limits without a trusted proxy', async () => {
        const direct = await startTestServer({ now: fakeClock().now });
        try {
            for (let i = 0; i < 10; i++) {
                expect((await postRoom(direct.url, { protocolVersion: 2 }, { 'x-forwarded-for': `10.0.0.${i}` })).status).toBe(200);
            }
            expect((await postRoom(direct.url, { protocolVersion: 2 }, { 'x-forwarded-for': '10.0.0.99' })).status).toBe(429);
        } finally {
            await direct.close();
        }
    });

    it('CORS echoes extension origins only', async () => {
        const ok = await fetch(`${s.url}/health`, { headers: { Origin: 'chrome-extension://abc' } });
        expect(ok.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc');
        const bad = await fetch(`${s.url}/health`, { headers: { Origin: 'https://evil.com' } });
        expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    });
});
