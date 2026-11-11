import { describe, expect, it } from 'vitest';
import { decideCorrection, SYNC_PROFILES, type PlayerSnapshot, type SyncProfile, type SyncTarget } from './controller';

const YT = SYNC_PROFILES.youtube;
const NF = SYNC_PROFILES.netflix;
const play = (positionSec: number, over: Partial<PlayerSnapshot> = {}): PlayerSnapshot =>
    ({ positionSec, paused: false, rate: 1, buffering: false, inAd: false, ...over });
const run = (
    target: Partial<SyncTarget>,
    player: PlayerSnapshot,
    o: { profile?: SyncProfile; lastSeekAtMs?: number; force?: boolean } = {},
) => decideCorrection({
    target: { positionSec: 100, paused: false, rate: 1, ...target },
    player,
    profile: o.profile ?? YT,
    nowMs: 10_000,
    lastSeekAtMs: o.lastSeekAtMs ?? 0,
    force: o.force ?? false,
});

describe('decideCorrection', () => {
    it('in sync → nothing', () => expect(run({}, play(100.03))).toMatchObject({ state: 'synced', actions: [] }));
    it('ahead 0.4s → slow down, capped at 5%', () => expect(run({}, play(100.4)).actions).toEqual([{ type: 'rate', rate: 0.95 }]));
    it('behind 0.12s → speed up 3%', () => expect(run({}, play(99.88)).actions).toEqual([{ type: 'rate', rate: 1.03 }]));
    it('3s behind → seek with lead', () => expect(run({}, play(97)).actions).toEqual([{ type: 'seek', toSec: 100.1 }]));
    it('3s behind inside cooldown → wait', () => expect(run({}, play(97), { lastSeekAtMs: 9_000 }).actions).toEqual([]));
    it('netflix 1s off → no nudge, drifting', () =>
        expect(run({}, play(101), { profile: NF })).toMatchObject({ state: 'drifting', actions: [] }));
    it('netflix 2s off → seek with 0.3 lead', () =>
        expect(run({}, play(98), { profile: NF }).actions).toEqual([{ type: 'seek', toSec: 100.3 }]));
    it('target paused, player playing → pause', () =>
        expect(run({ paused: true }, play(100.1)).actions).toEqual([{ type: 'pause' }]));
    it('target paused 0.5s off → exact seek then pause', () =>
        expect(run({ paused: true }, play(100.5)).actions).toEqual([{ type: 'seek', toSec: 100 }, { type: 'pause' }]));
    it('target playing, player paused → play', () =>
        expect(run({}, play(100.05, { paused: true })).actions).toEqual([{ type: 'play' }]));
    it('own ad → no actions', () => expect(run({}, play(50, { inAd: true }))).toMatchObject({ state: 'ad', actions: [] }));
    it('own ad stuck paused while the host plays → press play so the ad can end', () =>
        expect(run({}, play(50, { inAd: true, paused: true }))).toMatchObject({ state: 'ad', actions: [{ type: 'play' }] }));
    it('buffering → no actions', () =>
        expect(run({}, play(90, { buffering: true }))).toMatchObject({ state: 'buffering', actions: [] }));
    it('force bypasses cooldown with deadband threshold', () =>
        expect(run({}, play(99.8), { lastSeekAtMs: 9_900, force: true }).actions).toEqual([{ type: 'seek', toSec: 100.1 }]));
    it('restores rate after converging', () =>
        expect(run({}, play(100.05, { rate: 0.95 })).actions).toEqual([{ type: 'rate', rate: 1 }]));
    it('follows host rate', () => expect(run({ rate: 1.5 }, play(100)).actions).toEqual([{ type: 'rate', rate: 1.5 }]));
    it('reports paused state when the target is paused', () =>
        expect(run({ paused: true }, play(100, { paused: true }))).toMatchObject({ state: 'paused', actions: [] }));
});
