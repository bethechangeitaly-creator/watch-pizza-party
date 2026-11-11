import { describe, expect, it, vi } from 'vitest';
import { VolumeBoost, type CaptureDeps } from './volume';

function setup(grantedTabs: number[] = [7]) {
    const sent: Array<Record<string, unknown>> = [];
    const deps: CaptureDeps = {
        getStreamId: vi.fn(async (tabId: number) => {
            if (!grantedTabs.includes(tabId)) throw new Error('Extension has not been invoked for the current page (see activeTab permission).');
            return `stream-${tabId}`;
        }),
        ensureOffscreen: vi.fn(async () => {}),
        closeOffscreen: vi.fn(async () => {}),
        toOffscreen: vi.fn(async (m: Record<string, unknown>) => { sent.push(m); }),
    };
    const gains: number[] = [];
    return { deps, sent, gains, boost: new VolumeBoost(deps, (g) => gains.push(g)) };
}

describe('VolumeBoost', () => {
    it('arms a passthrough capture while Chrome allows it (panel opened on the video tab)', async () => {
        const { boost, sent } = setup();
        expect(await boost.arm(7)).toBe(true);
        expect(sent).toEqual([{ type: 'OFFSCREEN_START_CAPTURE', streamId: 'stream-7', gain: 1 }]);
        expect(boost.capturingTabId).toBe(7);
    });

    it('arming without Chrome\'s permission fails quietly', async () => {
        const { boost, sent } = setup([]);
        expect(await boost.arm(7)).toBe(false);
        expect(sent).toEqual([]);
        expect(boost.capturingTabId).toBeNull();
    });

    it('once armed, the slider only changes the gain — no new permission needed', async () => {
        const { boost, sent, deps } = setup();
        await boost.arm(7);
        (deps.getStreamId as ReturnType<typeof vi.fn>).mockClear();
        expect(await boost.setGain(7, 2)).toEqual({ ok: true });
        expect(deps.getStreamId).not.toHaveBeenCalled();
        expect(sent.at(-1)).toEqual({ type: 'OFFSCREEN_SET_GAIN', gain: 2 });
    });

    it('not armed yet: tries to start, and says what to do if Chrome refuses', async () => {
        const ok = setup();
        expect(await ok.boost.setGain(7, 1.5)).toEqual({ ok: true });
        expect(ok.sent).toEqual([{ type: 'OFFSCREEN_START_CAPTURE', streamId: 'stream-7', gain: 1.5 }]);
        const refused = setup([]);
        expect(await refused.boost.setGain(7, 1.5)).toEqual({ ok: false, reason: 'needs_icon_click' });
    });

    it('going back to 100% keeps the capture so boosting again needs no new permission', async () => {
        const { boost, sent } = setup();
        await boost.setGain(7, 2);
        await boost.setGain(7, 1);
        expect(sent.at(-1)).toEqual({ type: 'OFFSCREEN_SET_GAIN', gain: 1 });
        expect(boost.capturingTabId).toBe(7);
    });

    it('clamps the gain to 1–3', async () => {
        const { boost, sent } = setup();
        await boost.setGain(7, 9);
        expect(sent.at(-1)).toMatchObject({ gain: 3 });
    });

    it('stop releases the capture', async () => {
        const { boost, sent, deps, gains } = setup();
        await boost.arm(7);
        await boost.stop();
        expect(sent.at(-1)).toEqual({ type: 'OFFSCREEN_STOP_CAPTURE' });
        expect(deps.closeOffscreen).toHaveBeenCalled();
        expect(boost.capturingTabId).toBeNull();
        expect(gains.at(-1)).toBe(1);
    });
});
