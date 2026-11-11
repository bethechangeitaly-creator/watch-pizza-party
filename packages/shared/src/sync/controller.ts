import type { SupportedPlatform } from '../media';
import type { ViewerSyncState } from '../protocol';

export type SyncProfile = {
    seekThresholdSec: number;
    seekCooldownMs: number;
    seekLeadSec: number;
    deadbandSec: number;
    rateNudge: boolean;
    maxRateAdjust: number;
    convergeSec: number;
};

export const SYNC_PROFILES: Record<SupportedPlatform, SyncProfile> = {
    youtube: { seekThresholdSec: 1.0, seekCooldownMs: 1500, seekLeadSec: 0.1, deadbandSec: 0.08, rateNudge: true, maxRateAdjust: 0.05, convergeSec: 4 },
    netflix: { seekThresholdSec: 1.5, seekCooldownMs: 4000, seekLeadSec: 0.3, deadbandSec: 0.4, rateNudge: false, maxRateAdjust: 0, convergeSec: 4 },
    // Prime Video: seeks only (its player resets the rate), with a wider margin because episode time is derived around ads.
    prime: { seekThresholdSec: 2.0, seekCooldownMs: 4000, seekLeadSec: 0.5, deadbandSec: 0.6, rateNudge: false, maxRateAdjust: 0, convergeSec: 4 },
};

export type PlayerSnapshot = { positionSec: number; paused: boolean; rate: number; buffering: boolean; inAd: boolean };
export type SyncTarget = { positionSec: number; paused: boolean; rate: number };
export type SyncAction =
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'seek'; toSec: number }
    | { type: 'rate'; rate: number };
export type Decision = { driftSec: number; state: ViewerSyncState; actions: SyncAction[] };

const PAUSED_SEEK_THRESHOLD_SEC = 0.25;
const SYNCED_TOLERANCE_SEC = 0.3;
const RATE_EPSILON = 0.001;

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function decideCorrection(input: {
    target: SyncTarget;
    player: PlayerSnapshot;
    profile: SyncProfile;
    nowMs: number;
    lastSeekAtMs: number;
    force: boolean;
}): Decision {
    const { target, player, profile, nowMs, lastSeekAtMs, force } = input;
    const driftSec = player.positionSec - target.positionSec;
    const absDrift = Math.abs(driftSec);

    if (player.inAd) return { driftSec, state: 'ad', actions: [] };
    if (player.buffering) return { driftSec, state: 'buffering', actions: [] };

    const actions: SyncAction[] = [];

    const seekThreshold = force
        ? profile.deadbandSec
        : target.paused ? PAUSED_SEEK_THRESHOLD_SEC : profile.seekThresholdSec;
    const cooldownOver = force || nowMs - lastSeekAtMs >= profile.seekCooldownMs;
    const seeked = absDrift > seekThreshold && cooldownOver;
    if (seeked) {
        actions.push({ type: 'seek', toSec: target.positionSec + (target.paused ? 0 : profile.seekLeadSec) });
    }

    if (target.paused !== player.paused) {
        actions.push({ type: target.paused ? 'pause' : 'play' });
    }

    if (!target.paused) {
        const inNudgeBand = absDrift > profile.deadbandSec && absDrift <= profile.seekThresholdSec;
        if (!seeked && profile.rateNudge && inNudgeBand) {
            const adjust = clamp(driftSec / profile.convergeSec, -profile.maxRateAdjust, profile.maxRateAdjust);
            const rate = round3(target.rate * (1 - adjust));
            if (Math.abs(player.rate - rate) > RATE_EPSILON) actions.push({ type: 'rate', rate });
        } else if (seeked || absDrift <= profile.seekThresholdSec) {
            if (Math.abs(player.rate - target.rate) > RATE_EPSILON) actions.push({ type: 'rate', rate: target.rate });
        }
        // Otherwise: far off but inside the seek cooldown — wait for the next seek.
    }

    const state: ViewerSyncState = target.paused
        ? 'paused'
        : absDrift <= Math.max(profile.deadbandSec, SYNCED_TOLERANCE_SEC) ? 'synced' : 'drifting';

    return { driftSec, state, actions };
}
