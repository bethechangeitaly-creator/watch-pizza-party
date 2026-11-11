import type { MediaRef, PlayerSnapshot } from '@watch-party/shared';
import type { PlayerAdapter } from '../content/adapters';

export type FakeAdapter = PlayerAdapter & {
    calls: Array<[string, ...number[]]>;
    snap: PlayerSnapshot | null;
    mediaRef: MediaRef | null;
};

export function fakeAdapter(init: { media?: MediaRef | null; snap?: PlayerSnapshot | null } = {}): FakeAdapter {
    const adapter: FakeAdapter = {
        platform: 'youtube',
        calls: [],
        mediaRef: init.media === undefined ? { platform: 'youtube', mediaId: 'dQw4w9WgXcQ' } : init.media,
        snap: init.snap === undefined ? { positionSec: 10, paused: false, rate: 1, buffering: false, inAd: false } : init.snap,
        media: () => adapter.mediaRef,
        title: () => 'Song',
        snapshot: () => (adapter.snap ? { ...adapter.snap } : null),
        play: () => { adapter.calls.push(['play']); },
        pause: () => { adapter.calls.push(['pause']); },
        seek: (sec) => { adapter.calls.push(['seek', sec]); },
        setRate: (rate) => { adapter.calls.push(['rate', rate]); },
    };
    return adapter;
}

export function manualClock(start = 0) {
    let t = start;
    return { now: () => t, set: (v: number) => { t = v; }, advance: (ms: number) => { t += ms; } };
}
