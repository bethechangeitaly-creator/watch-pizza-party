import { describe, expect, it, vi } from 'vitest';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { VOLUME_NEEDS_CLICK, percentToGain, setBoost } from './volume';

const ok = { ok: true } as unknown as PanelResponse;

describe('volume boost (panel)', () => {
    it('clamps', () => {
        expect(percentToGain(-10)).toBe(0);
        expect(percentToGain(700)).toBe(6);
        expect(percentToGain(450)).toBe(4.5);
    });

    it('sends the gain to the background', async () => {
        const send = vi.fn(async (_r: PanelRequest) => ok);
        expect(await setBoost(200, send)).toEqual({ ok: true });
        expect(send).toHaveBeenCalledWith({ type: 'volume.set', gain: 2 });
    });

    it('explains how to allow it when Chrome refuses', async () => {
        const send = vi.fn(async (): Promise<PanelResponse> => ({ ok: false, error: 'x', code: 'needs_icon_click' }));
        expect(await setBoost(200, send)).toEqual({ ok: false, message: VOLUME_NEEDS_CLICK });
        expect(VOLUME_NEEDS_CLICK).toBe("Click the Watch Pizza Party icon while you're on the video tab, then try again.");
    });
});
