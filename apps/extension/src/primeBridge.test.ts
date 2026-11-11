// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { callBridge } from './content/bridge';

// Prime's player keeps its stores in React context (found on primevideo.com): seekBar.seekBar.positionMs is the
// episode position without ads, and seekBar.seekToPosition(ms) jumps there in one step.
const seekToPosition = vi.fn();
const stores = { seekBar: { seekToPosition, seekBar: { positionMs: 609_063, endPositionMs: 3_317_000 } } };

beforeAll(async () => {
    document.body.innerHTML = '<div id="dv-web-player"><div class="inner"><video></video></div></div>';
    const inner = document.querySelector('.inner') as unknown as Record<string, unknown>;
    inner['__reactInternalInstance$abc'] = { stateNode: inner, return: { stateNode: { context: { stores } }, return: null } };
    await import('./player-bridge');
});

describe('player bridge: Prime Video', () => {
    it('reads the exact episode time from Prime’s seek bar store', () => {
        expect(callBridge('prime.state')).toEqual({ handled: true, payload: expect.objectContaining({ timeSeconds: 609.063, durationSeconds: 3317 }) });
    });

    it('jumps in one step through Prime’s own seekToPosition', () => {
        expect(callBridge('prime.seek', { timeSeconds: 1200.5 })).toMatchObject({ handled: true });
        expect(seekToPosition).toHaveBeenCalledWith(1_200_500);
    });

    it('says "not handled" when Prime’s player isn’t there, so the adapter can fall back', () => {
        document.querySelector('#dv-web-player')!.remove();
        expect(callBridge('prime.state')?.handled).toBe(false);
    });
});
