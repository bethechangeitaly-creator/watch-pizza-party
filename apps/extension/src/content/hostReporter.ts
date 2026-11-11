import type { HostUpdateCause, MediaRef } from '@watch-party/shared';
import type { HostPlayerEvent } from '../lib/messages';
import type { PlayerAdapter } from './adapters';

export type HostSample = { media: MediaRef; positionSec: number; paused: boolean; rate: number; inAd: boolean; atLocalMs: number };

const SEEK_TOLERANCE_SEC = 1.0;
const RATE_EPSILON = 0.01;
const HEARTBEAT_MS = 5000;

export function classifyHostChange(prev: HostSample | null, next: HostSample): HostUpdateCause | null {
    if (!prev) return 'initial';
    if (prev.media.platform !== next.media.platform || prev.media.mediaId !== next.media.mediaId) return 'media';
    if (prev.inAd !== next.inAd) return 'ad';
    if (prev.paused !== next.paused) return next.paused ? 'pause' : 'play';
    if (Math.abs(prev.rate - next.rate) > RATE_EPSILON) return 'rate';
    const elapsedSec = Math.max(0, next.atLocalMs - prev.atLocalMs) / 1000;
    const expectedDelta = !prev.paused && !prev.inAd ? elapsedSec * prev.rate : 0;
    const observedDelta = next.positionSec - prev.positionSec;
    if (Math.abs(observedDelta - expectedDelta) > SEEK_TOLERANCE_SEC) return 'seek';
    return null;
}

/** Samples the host's player every tick and reports what changed. */
export class HostReporter {
    private prev: HostSample | null = null;
    private lastEmitAt = -Infinity;
    private lastContentPositionSec = 0;
    private buffering = false;

    constructor(
        private readonly adapter: PlayerAdapter,
        private readonly send: (event: HostPlayerEvent) => void,
        private readonly now: () => number,
    ) {}

    tick(): void {
        const media = this.adapter.media();
        const snap = this.adapter.snapshot();
        if (!media || !snap) {
            this.prev = null; // Browsing (YouTube home, search…): viewers stay put.
            return;
        }
        if (!snap.inAd) this.lastContentPositionSec = snap.positionSec;
        const sample: HostSample = {
            media,
            // During an ad the player clock is the ad's — report where the video itself stopped.
            positionSec: snap.inAd ? this.lastContentPositionSec : snap.positionSec,
            paused: snap.paused,
            rate: snap.rate,
            inAd: snap.inAd,
            atLocalMs: this.now(),
        };

        // Buffering: hold viewers (paused) without announcing a pause; release with the real state.
        if (snap.buffering !== this.buffering && this.prev) {
            this.buffering = snap.buffering;
            this.emit({ ...sample, paused: sample.paused || snap.buffering }, 'heartbeat');
            this.prev = sample;
            return;
        }
        if (snap.buffering) {
            this.prev = sample;
            return;
        }

        let cause = classifyHostChange(this.prev, sample);
        if (!cause && !sample.paused && sample.atLocalMs - this.lastEmitAt >= HEARTBEAT_MS) cause = 'heartbeat';
        this.prev = sample;
        if (cause) this.emit(sample, cause);
    }

    private emit(sample: HostSample, cause: HostUpdateCause): void {
        this.lastEmitAt = sample.atLocalMs;
        const title = this.adapter.title();
        this.send({
            platform: sample.media.platform,
            mediaId: sample.media.mediaId,
            ...(title ? { title } : {}),
            positionSec: sample.positionSec,
            capturedAtLocalMs: sample.atLocalMs,
            rate: sample.rate,
            paused: sample.paused,
            inAd: sample.inAd,
            cause,
        });
    }
}
