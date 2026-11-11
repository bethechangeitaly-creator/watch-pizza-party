import { describe, expect, it, vi } from 'vitest';
import { UPDATE_REQUIRED_MESSAGE } from '@watch-party/shared';
import { createRoomWithRetry } from './createRoom';

const created = { roomId: 'Jol4I72BE4', userId: 'u1', token: 'T'.repeat(24), username: 'Marco', avatarColor: '#FF6A3D' };

function harness() {
    let t = 0;
    return {
        now: () => t,
        sleep: vi.fn(async (ms: number) => { t += ms; }),
        onWaking: vi.fn(),
    };
}

describe('createRoomWithRetry', () => {
    it('retries through a cold start', async () => {
        const h = harness();
        const fetchImpl = vi.fn()
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response('', { status: 502 }))
            .mockResolvedValueOnce(Response.json(created));
        await expect(createRoomWithRetry({ baseUrl: 'https://s', username: 'Marco', fetchImpl, ...h })).resolves.toEqual(created);
        expect(h.onWaking).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://s/rooms');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ protocolVersion: 2, username: 'Marco' });
        expect(h.sleep.mock.calls.map((c) => c[0])).toEqual([2000, 3000]);
    });

    it('stops immediately on 426', async () => {
        const h = harness();
        const fetchImpl = vi.fn().mockResolvedValue(Response.json({ code: 'update_required' }, { status: 426 }));
        await expect(createRoomWithRetry({ baseUrl: 'https://s', username: 'Marco', fetchImpl, ...h })).rejects.toThrow(UPDATE_REQUIRED_MESSAGE);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('explains rate limiting', async () => {
        const h = harness();
        const fetchImpl = vi.fn().mockResolvedValue(Response.json({ code: 'rate_limited' }, { status: 429 }));
        await expect(createRoomWithRetry({ baseUrl: 'https://s', username: 'Marco', fetchImpl, ...h }))
            .rejects.toThrow('Too many parties started from this network. Try again in a minute.');
    });

    it('gives up after 75s', async () => {
        const h = harness();
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        await expect(createRoomWithRetry({ baseUrl: 'https://s', username: 'Marco', fetchImpl, ...h }))
            .rejects.toThrow("The server didn't wake up. Try again in a minute.");
        expect(h.now()).toBeLessThanOrEqual(75_000);
        expect(h.onWaking).toHaveBeenCalledTimes(1);
    });
});
