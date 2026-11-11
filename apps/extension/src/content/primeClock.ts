/**
 * Prime Video stitches its ads into the episode's own <video>, so `video.currentTime` counts ad
 * time too (measured: 127.3 s on the video = 01:27 on the player after a 40 s pre-roll). Everyone in a
 * party gets different ads, so sync must use episode time. This clock learns where the ad breaks
 * are from the player's "Ad 0:22" countdown, and corrects itself whenever the player shows its
 * elapsed time (which covers ads that played before we were watching).
 */
type Break = { start: number; end: number };

export type PrimeObservation = {
    streamSec: number;
    durationSec: number;
    /** Seconds left in the ad, while the ad countdown is on screen; null otherwise. */
    adRemainingSec: number | null;
    /** Elapsed episode time the player shows (whole seconds), when its controls are visible. */
    labelElapsedSec: number | null;
};

export class PrimeClock {
    private breaks: Break[] = [];
    private correction = 0;
    private durationSec = Number.NaN;
    private inAdBreak: Break | null = null;
    private seen = false;
    /** True once the clock can be trusted: it watched from the start, or it has read the player's time. */
    calibrated = false;

    observe(o: PrimeObservation): void {
        if (Number.isFinite(this.durationSec) && Math.abs(o.durationSec - this.durationSec) > 2) this.reset();
        this.durationSec = o.durationSec;
        if (!this.seen) {
            this.seen = true;
            if (o.streamSec < 3) this.calibrated = true; // nothing (no ad) can be before this point unseen
        }

        if (o.adRemainingSec !== null) {
            const end = o.streamSec + o.adRemainingSec;
            let current = this.breaks.find((b) => o.streamSec >= b.start - 1.5 && o.streamSec <= b.end + 1.5) ?? null;
            if (!current) {
                current = { start: o.streamSec, end };
                this.breaks.push(current);
                this.breaks.sort((a, b) => a.start - b.start);
            }
            current.start = Math.min(current.start, o.streamSec);
            current.end = Math.max(current.end, end);
            this.inAdBreak = current;
            return;
        }

        if (this.inAdBreak) {
            // The countdown only has whole seconds; the moment it disappears is the exact end.
            if (o.streamSec >= this.inAdBreak.start && o.streamSec <= this.inAdBreak.end + 3) this.inAdBreak.end = o.streamSec;
            this.inAdBreak = null;
        }

        if (o.labelElapsedSec !== null) {
            const content = this.toContent(o.streamSec);
            const shown = o.labelElapsedSec; // whole seconds: the real time is in [shown, shown + 1)
            if (content < shown - 0.25 || content > shown + 1.25) this.correction += content - (shown + 0.5);
            this.calibrated = true;
        }
    }

    /** Episode time for a position on the video (inside an ad: where the ad started). */
    toContent(streamSec: number): number {
        let at = streamSec;
        let ads = 0;
        for (const b of this.breaks) {
            if (at >= b.end) ads += b.end - b.start;
            else {
                if (at >= b.start) at = b.start;
                break;
            }
        }
        return Math.max(0, at - ads - this.correction);
    }

    /** Position on the video for an episode time (after any ad break that comes before it). */
    toStream(contentSec: number): number {
        const target = contentSec + this.correction;
        let ads = 0;
        for (const b of this.breaks) {
            if (target >= b.start - ads) ads += b.end - b.start;
            else break;
        }
        return target + ads;
    }

    private reset(): void {
        this.breaks = [];
        this.correction = 0;
        this.inAdBreak = null;
        this.seen = false;
        this.calibrated = false;
    }
}
