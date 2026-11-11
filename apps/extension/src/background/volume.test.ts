import { describe, expect, it, vi } from 'vitest';
import { VolumeBoost, type CaptureDeps } from './volume';

function setup(grantedTabs: number[] = [7], offscreen: { startOk?: boolean; capturingTabId?: number | null } = {}) {
    const sent: Array<Record<string, unknown>> = [];
    const deps: CaptureDeps = {
        getStreamId: vi.fn(async (tabId: number) => {
            if (!grantedTabs.includes(tabId)) throw new Error('Extension has not been invoked for the current page (see activeTab permission).');
            return `stream-${tabId}`;
        }),
        ensureOffscreen: vi.fn(async () => {}),
        closeOffscreen: vi.fn(async () => {}),
        toOffscreen: vi.fn(async (m: Record<string, unknown>) => {
            if (m.type === 'OFFSCREEN_PING') return { ok: true, capturing: offscreen.capturingTabId != null, tabId: offscreen.capturingTabId ?? null };
            sent.push(m);
            if (m.type === 'OFFSCREEN_START_CAPTURE') return offscreen.startOk === false ? { ok: false, error: 'NotAllowedError' } : { ok: true };
            return { ok: true };
        }),
    };
    const gains: number[] = [];
    const readies: Array<number | null> = [];
    return { deps, sent, gains, readies, boost: new VolumeBoost(deps, (g, ready) => { gains.push(g); readies.push(ready); }) };
}

describe('VolumeBoost', () => {
    it('arms a passthrough capture while Chrome allows it (panel opened on the video tab)', async () => {
        const { boost, sent } = setup();
        expect(await boost.arm(7)).toBe(true);
        expect(sent).toEqual([{ type: 'OFFSCREEN_START_CAPTURE', streamId: 'stream-7', tabId: 7, gain: 1 }]);
        expect(boost.capturingTabId).toBe(7);
    });

    it('reports failure when the offscreen document could not start the capture', async () => {
        const { boost, deps } = setup([7], { startOk: false });
        expect(await boost.arm(7)).toBe(false);
        expect(boost.capturingTabId).toBeNull();
        expect(deps.closeOffscreen).toHaveBeenCalled();
        expect(await boost.setGain(7, 2)).toEqual({ ok: false, reason: 'needs_icon_click' });
    });

    it('picks up a capture that survived a service-worker restart instead of asking for a click', async () => {
        const { boost, sent, deps } = setup([], { capturingTabId: 7 });
        expect(await boost.setGain(7, 2)).toEqual({ ok: true });
        expect(deps.getStreamId).not.toHaveBeenCalled();
        expect(sent.at(-1)).toEqual({ type: 'OFFSCREEN_SET_GAIN', gain: 2 });
        expect(boost.capturingTabId).toBe(7);
    });

    it('tells the panel when boost is ready', async () => {
        const { boost, readies } = setup();
        await boost.arm(7);
        expect(readies.at(-1)).toBe(7);
        await boost.stop();
        expect(readies.at(-1)).toBeNull();
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
        expect(ok.sent).toEqual([{ type: 'OFFSCREEN_START_CAPTURE', streamId: 'stream-7', tabId: 7, gain: 1.5 }]);
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

    it('a second request while the capture is still starting waits for it instead of failing', async () => {
        const { boost, deps, sent } = setup();
        let release: (() => void) | undefined;
        (deps.ensureOffscreen as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
        const first = boost.arm(7);
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        const second = boost.setGain(7, 2);
        release!();
        expect(await first).toBe(true);
        expect(await second).toEqual({ ok: true });
        expect(deps.getStreamId).toHaveBeenCalledTimes(1);
        expect(sent.at(-1)).toEqual({ type: 'OFFSCREEN_SET_GAIN', gain: 2 });
    });

    it('clamps the gain to 0–6 like 1.2', async () => {
        const { boost, sent } = setup();
        await boost.setGain(7, 9);
        expect(sent.at(-1)).toMatchObject({ gain: 6 });
        await boost.setGain(7, -1);
        expect(sent.at(-1)).toMatchObject({ gain: 0 });
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
