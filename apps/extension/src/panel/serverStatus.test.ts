import { describe, expect, it, vi } from 'vitest';
import { isDonateDue } from './donate';
import { checkServer } from './serverStatus';

describe('checkServer', () => {
    it('is online when /health answers', async () => {
        const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
        expect(await checkServer('https://s', fetchImpl)).toBe('online');
        expect(fetchImpl).toHaveBeenCalledWith('https://s/health', expect.anything());
    });

    it('is offline when the request fails or errors', async () => {
        expect(await checkServer('https://s', vi.fn(async () => { throw new Error('net'); }))).toBe('offline');
        expect(await checkServer('https://s', vi.fn(async () => new Response('', { status: 502 })))).toBe('offline');
    });
});

describe('isDonateDue', () => {
    it('is due the first time and again after the snooze', () => {
        expect(isDonateDue(null, 1000)).toBe(true);
        expect(isDonateDue(2000, 1000)).toBe(false);
        expect(isDonateDue(2000, 2000)).toBe(true);
    });
});
