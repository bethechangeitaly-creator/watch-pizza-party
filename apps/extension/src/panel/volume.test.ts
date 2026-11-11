import { describe, expect, it, vi } from 'vitest';
import type { PanelRequest, PanelResponse } from '../lib/messages';
import { percentToGain, startOrUpdateBoost } from './volume';

const okResponse = { ok: true } as unknown as PanelResponse;

function setup(capturing: boolean, getStreamId = vi.fn(async () => 'S')) {
    const sent: PanelRequest[] = [];
    const send = vi.fn(async (r: PanelRequest) => { sent.push(r); return okResponse; });
    return { sent, send, getStreamId, run: (percent: number) => startOrUpdateBoost({ percent, mediaTabId: 7, capturing, send, getStreamId }) };
}

describe('volume boost', () => {
    it('clamps', () => {
        expect(percentToGain(50)).toBe(1);
        expect(percentToGain(350)).toBe(3);
        expect(percentToGain(150)).toBe(1.5);
    });

    it('100% stops', async () => {
        const h = setup(true);
        expect(await h.run(100)).toEqual({ ok: true });
        expect(h.sent).toEqual([{ type: 'volume.stop' }]);
        expect(h.getStreamId).not.toHaveBeenCalled();
    });

    it('first boost gets a stream id then starts', async () => {
        const h = setup(false);
        await h.run(200);
        expect(h.getStreamId).toHaveBeenCalledWith(7);
        expect(h.sent).toEqual([{ type: 'volume.start', tabId: 7, streamId: 'S', gain: 2 }]);
    });

    it('while capturing only sets gain', async () => {
        const h = setup(true);
        await h.run(250);
        expect(h.sent).toEqual([{ type: 'volume.setGain', gain: 2.5 }]);
        expect(h.getStreamId).not.toHaveBeenCalled();
    });

    it('reports unavailable tabs', async () => {
        const h = setup(false, vi.fn(async () => { throw new Error('Cannot capture'); }));
        expect(await h.run(200)).toEqual({ ok: false, message: "Volume boost isn't available on this tab." });
        expect(h.sent).toEqual([]);
    });
});
