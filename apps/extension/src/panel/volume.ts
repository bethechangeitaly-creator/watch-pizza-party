import type { PanelRequest, PanelResponse } from '../lib/messages';

export const VOLUME_MIN = 100;
export const VOLUME_MAX = 300;
export const VOLUME_UNAVAILABLE = "Volume boost isn't available on this tab.";

export function percentToGain(percent: number): number {
    const clamped = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Number.isFinite(percent) ? percent : VOLUME_MIN));
    return clamped / 100;
}

/**
 * Called from the slider's change handler, so getStreamId runs inside the user's gesture.
 * Nothing else ever starts a capture, and nothing switches tabs.
 */
export async function startOrUpdateBoost(args: {
    percent: number;
    mediaTabId: number;
    capturing: boolean;
    send: (r: PanelRequest) => Promise<PanelResponse>;
    getStreamId: (tabId: number) => Promise<string>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const gain = percentToGain(args.percent);
    if (gain === 1) {
        await args.send({ type: 'volume.stop' });
        return { ok: true };
    }
    if (args.capturing) {
        await args.send({ type: 'volume.setGain', gain });
        return { ok: true };
    }
    let streamId: string;
    try {
        streamId = await args.getStreamId(args.mediaTabId);
    } catch {
        return { ok: false, message: VOLUME_UNAVAILABLE };
    }
    const response = await args.send({ type: 'volume.start', tabId: args.mediaTabId, streamId, gain });
    return response.ok ? { ok: true } : { ok: false, message: VOLUME_UNAVAILABLE };
}

export function getTabStreamId(tabId: number): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
            const error = chrome.runtime.lastError;
            if (error || !streamId) reject(new Error(error?.message ?? 'no stream'));
            else resolve(streamId);
        });
    });
}
