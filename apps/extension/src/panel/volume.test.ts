import { describe, expect, it, vi } from 'vitest';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { VOLUME_NEEDS_CLICK, percentToGain, setBoost } from './volume';

const ok = { ok: true } as unknown as PanelResponse;

describe('volume boost (panel)', () => {
    it('clamps', () => {
        expect(percentToGain(50)).toBe(1);
        expect(percentToGain(350)).toBe(3);
        expect(percentToGain(150)).toBe(1.5);
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
