import { describe, expect, it } from 'vitest';
import { connectClient, startTestServer } from './helpers';

describe('app', () => {
    it('serves /health', async () => {
        const s = await startTestServer();
        const res = await fetch(`${s.url}/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        await s.close();
    });

    it('accepts a websocket connection', async () => {
        const s = await startTestServer();
        const c = await connectClient(s.url);
        expect(c.socket.connected).toBe(true);
        c.close();
        await s.close();
    });
});
