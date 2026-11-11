import {
    SYNC_PROFILES,
    decideCorrection,
    expectedPositionSec,
    isTimelinePaused,
    type Timeline,
    type ViewerSyncState,
} from '@watch-party/shared';
import type { PlayerAdapter } from './adapters';

const REPORT_EVERY_MS = 2000;

/** Runs the sync controller against the viewer's own player. */
export class ViewerFollower {
    private timeline: Timeline | null = null;
    private offsetMs = 0;
    private forceNext = false;
    private lastSeekAtMs = -Infinity;
    private lastReport: { at: number; state: ViewerSyncState } | null = null;

    constructor(
        private readonly adapter: PlayerAdapter,
        private readonly report: (status: { rev: number; driftSec: number; state: ViewerSyncState }) => void,
        private readonly now: () => number,
    ) {}

    setTimeline(timeline: Timeline, clockOffsetMs: number, force: boolean): void {
        this.timeline = timeline;
        this.offsetMs = clockOffsetMs;
        if (force) this.forceNext = true;
    }

    setClock(offsetMs: number): void {
        this.offsetMs = offsetMs;
    }

    tick(): void {
        const t = this.timeline;
        if (!t) return;
        const media = this.adapter.media();
        if (!media || media.platform !== t.platform || media.mediaId !== t.mediaId) return;
        const player = this.adapter.snapshot();
        if (!player) {
            this.adapter.open?.(); // right page, player not showing yet (Prime Video detail page)
            return;
        }

        const now = this.now();
        const decision = decideCorrection({
            target: { positionSec: expectedPositionSec(t, now + this.offsetMs), paused: isTimelinePaused(t), rate: t.rate },
            player,
            profile: SYNC_PROFILES[t.platform],
            nowMs: now,
            lastSeekAtMs: this.lastSeekAtMs,
            force: this.forceNext,
        });
        this.forceNext = false;

        for (const action of decision.actions) {
            switch (action.type) {
                case 'seek':
                    this.adapter.seek(action.toSec);
                    this.lastSeekAtMs = now;
                    break;
                case 'play':
                    this.adapter.play();
                    break;
                case 'pause':
                    this.adapter.pause();
                    break;
                case 'rate':
                    this.adapter.setRate(action.rate);
                    break;
            }
        }

        if (!this.lastReport || this.lastReport.state !== decision.state || now - this.lastReport.at >= REPORT_EVERY_MS) {
            this.lastReport = { at: now, state: decision.state };
            this.report({ rev: t.rev, driftSec: Math.round(decision.driftSec * 1000) / 1000, state: decision.state });
        }
    }
}
