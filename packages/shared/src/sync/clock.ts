type ClockSample = { offsetMs: number; rttMs: number };

/**
 * NTP-style clock offset estimator. Each sample is one round trip:
 * sent locally at t0, stamped by the server, received locally at t3.
 * The sample with the smallest round trip is the most trustworthy.
 */
export class ClockSync {
    private readonly samples: ClockSample[] = [];

    constructor(private readonly maxSamples = 8) {}

    addSample(sentAtLocalMs: number, serverMs: number, receivedAtLocalMs: number): void {
        const rttMs = receivedAtLocalMs - sentAtLocalMs;
        if (!Number.isFinite(rttMs) || rttMs < 0 || !Number.isFinite(serverMs)) return;
        this.samples.push({ offsetMs: serverMs - (sentAtLocalMs + receivedAtLocalMs) / 2, rttMs });
        if (this.samples.length > this.maxSamples) this.samples.shift();
    }

    private best(): ClockSample | null {
        let best: ClockSample | null = null;
        for (const sample of this.samples) {
            if (!best || sample.rttMs < best.rttMs) best = sample;
        }
        return best;
    }

    get offsetMs(): number | null {
        return this.best()?.offsetMs ?? null;
    }

    get rttMs(): number | null {
        return this.best()?.rttMs ?? null;
    }

    get sampleCount(): number {
        return this.samples.length;
    }

    toServerTime(localMs: number): number {
        return localMs + (this.offsetMs ?? 0);
    }
}
