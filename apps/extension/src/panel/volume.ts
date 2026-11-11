import type { PanelRequest, PanelResponse } from '../lib/messages';

export const VOLUME_MIN = 100;
export const VOLUME_MAX = 300;
export const VOLUME_NEEDS_CLICK = "Click the Watch Pizza Party icon while you're on the video tab, then try again.";

export function percentToGain(percent: number): number {
    const clamped = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Number.isFinite(percent) ? percent : VOLUME_MIN));
    return clamped / 100;
}

export async function setBoost(
    percent: number,
    send: (r: PanelRequest) => Promise<PanelResponse>,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const response = await send({ type: 'volume.set', gain: percentToGain(percent) });
    if (response.ok) return { ok: true };
    return { ok: false, message: response.code === 'needs_icon_click' ? VOLUME_NEEDS_CLICK : response.error };
}
