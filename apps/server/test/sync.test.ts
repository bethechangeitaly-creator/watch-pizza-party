import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostUpdate } from '@watch-party/shared';
import { connectClient, fakeClock, join, postRoom, startTestServer, type TestClient } from './helpers';

let s: Awaited<ReturnType<typeof startTestServer>>;
let clock: ReturnType<typeof fakeClock>;
const clients: TestClient[] = [];
const client = async () => { const c = await connectClient(s.url); clients.push(c); return c; };
let roomId: string;
let viewerId: string;
let host: TestClient;
let viewer: TestClient;

const upd = (o: Partial<HostUpdate> = {}): HostUpdate => ({
    platform: 'youtube', mediaId: 'dQw4w9WgXcQ', title: 'Song', positionSec: 62,
    atServerMs: clock.now(), rate: 1, paused: true, inAd: false, cause: 'pause', ...o,
});

beforeEach(async () => {
    clock = fakeClock();
    s = await startTestServer({ now: clock.now });
    const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
    roomId = room.roomId;
    host = await client();
    await join(host, roomId, { token: room.token });
    viewer = await client();
    viewerId = (await join(viewer, roomId, { username: 'Luca' })).userId;
});
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await s.close(); });

describe('sync', () => {
    it('time ack returns server now', async () => {
        expect(await host.time()).toBe(clock.now());
    });

    it('host update → rev 1 timeline to everyone', async () => {
        host.send({ type: 'sync.host_update', payload: upd() });
        expect(await viewer.waitFor('sync.timeline')).toMatchObject({
            rev: 1, positionSec: 62, anchorServerMs: clock.now(), updatedBy: 'Marco', cause: 'pause',
        });
    });

    it('clamps bogus clocks', async () => {
        host.send({ type: 'sync.host_update', payload: upd({ atServerMs: clock.now() + 60_000 }) });
        expect((await viewer.waitFor('sync.timeline')).anchorServerMs).toBe(clock.now() + 1000);
        host.send({ type: 'sync.host_update', payload: upd({ atServerMs: clock.now() - 60_000 }) });
        expect((await viewer.waitFor('sync.timeline')).anchorServerMs).toBe(clock.now() - 5000);
    });

    it('viewer cannot drive playback (hijack regression)', async () => {
        viewer.send({ type: 'sync.host_update', payload: upd() });
        expect((await viewer.waitFor('error')).code).toBe('not_host');
        expect(s.app.store.getTimeline(roomId)).toBeNull();
    });

    it('rev is server-owned', async () => {
        host.send({ type: 'sync.host_update', payload: { ...upd(), rev: 999 } });
        host.send({ type: 'sync.host_update', payload: { ...upd({ cause: 'heartbeat' }), rev: 999 } });
        expect((await viewer.waitFor('sync.timeline')).rev).toBe(1);
        expect((await viewer.waitFor('sync.timeline')).rev).toBe(2);
    });

    it('late joiner receives the current timeline', async () => {
        host.send({ type: 'sync.host_update', payload: upd() });
        await viewer.waitFor('sync.timeline');
        const late = await client();
        await join(late, roomId);
        expect((await late.waitFor('sync.timeline')).rev).toBe(1);
    });

    it.each([
        ['pause', { paused: true }, 'Marco paused at 1:02'],
        ['play', { paused: false }, 'Marco pressed play'],
        ['seek', { positionSec: 754 }, 'Marco jumped to 12:34'],
        ['media', { mediaId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' }, 'Marco started "Big Buck Bunny"'],
    ] as const)('%s produces a system event', async (cause, o, text) => {
        host.send({ type: 'sync.host_update', payload: upd({ cause, ...o }) });
        expect((await viewer.waitFor('system.event', (e) => e.kind === cause)).text).toBe(text);
    });

    it('heartbeat produces no event', async () => {
        host.send({ type: 'sync.host_update', payload: upd({ cause: 'heartbeat' }) });
        await viewer.waitFor('sync.timeline');
        await viewer.expectNone('system.event', 300);
    });

    it('viewer status change re-broadcasts room.state once', async () => {
        await host.waitFor('room.state', (r) => r.participants.length === 2);
        viewer.send({ type: 'sync.viewer_status', payload: { rev: 1, driftSec: 2, state: 'drifting' } });
        await host.waitFor('room.state', (r) => r.participants.find((p) => p.id === viewerId)?.status === 'drifting');
        viewer.send({ type: 'sync.viewer_status', payload: { rev: 1, driftSec: 2.1, state: 'drifting' } });
        await host.expectNone('room.state', 300);
    });

    it('viewer request reaches host', async () => {
        viewer.send({ type: 'sync.request', payload: { reason: 'pause' } });
        expect(await host.waitFor('sync.request')).toMatchObject({ reason: 'pause', username: 'Luca', userId: viewerId });
        expect((await host.waitFor('system.event', (e) => e.kind === 'request')).text).toBe('Luca asked the host to pause');
    });

    it('force re-broadcasts with cause force and next rev', async () => {
        host.send({ type: 'sync.host_update', payload: upd() });
        await viewer.waitFor('sync.timeline');
        host.send({ type: 'sync.force', payload: {} });
        expect(await viewer.waitFor('sync.timeline')).toMatchObject({ rev: 2, cause: 'force', positionSec: 62 });
        expect((await viewer.waitFor('system.event', (e) => e.kind === 'force')).text).toBe('Marco synced everyone');
    });

    it('viewer cannot force', async () => {
        viewer.send({ type: 'sync.force', payload: {} });
        expect((await viewer.waitFor('error')).code).toBe('not_host');
    });
});
