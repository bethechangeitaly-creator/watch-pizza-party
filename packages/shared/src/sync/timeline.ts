import type { Timeline } from '../protocol';

/** The host is effectively paused while it plays an ad: viewers hold their position. */
export function isTimelinePaused(t: Timeline): boolean {
    return t.paused || t.inAd;
}

export function expectedPositionSec(t: Timeline, serverNowMs: number): number {
    if (isTimelinePaused(t)) return t.positionSec;
    const elapsedSec = Math.max(0, serverNowMs - t.anchorServerMs) / 1000;
    return t.positionSec + elapsedSec * t.rate;
}
