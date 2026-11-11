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
/** If the video is still paused this long after we asked it to play, Chrome is blocking playback. */
const BLOCKED_AFTER_MS = 2500;

export type ViewerReport = { rev: number; driftSec: number; state: ViewerSyncState; needsClick: boolean };

/** Runs the sync controller against the viewer's own player. */
export class ViewerFollower {
    private timeline: Timeline | null = null;
    private offsetMs = 0;
    private forceNext = false;
    private lastSeekAtMs = -Infinity;
    private lastReport: { at: number; state: ViewerSyncState; needsClick: boolean } | null = null;
    private playPendingSince: number | null = null;

    constructor(
        private readonly adapter: PlayerAdapter,
        private readonly report: (status: ViewerReport) => void,
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

        // A click on the video is needed when Chrome blocks playback in a tab we opened, or (Prime Video)
        // until the player has shown its time once — before that, jumps would land in the wrong place.
        const uncalibrated = this.adapter.needsUserClick?.() ?? false;
        const hostPlaying = !isTimelinePaused(t) && !t.inAd;
        if (hostPlaying && player.paused) this.playPendingSince ??= now;
        else this.playPendingSince = null;
        const blocked = this.playPendingSince !== null && now - this.playPendingSince >= BLOCKED_AFTER_MS;
        const needsClick = uncalibrated || blocked;
        const actions = uncalibrated ? decision.actions.filter((a) => a.type !== 'seek') : decision.actions;

        for (const action of actions) {
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

        const changed = !this.lastReport || this.lastReport.state !== decision.state || this.lastReport.needsClick !== needsClick;
        if (changed || now - this.lastReport!.at >= REPORT_EVERY_MS) {
            this.lastReport = { at: now, state: decision.state, needsClick };
            this.report({ rev: t.rev, driftSec: Math.round(decision.driftSec * 1000) / 1000, state: decision.state, needsClick });
        }
    }
}
