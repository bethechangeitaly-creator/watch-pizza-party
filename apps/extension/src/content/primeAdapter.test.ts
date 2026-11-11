// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrimeAdapter } from './adapters';

/** Fake MAIN-world bridge answering like player-bridge.js does on primevideo.com. */
function fakePrimeBridge(positionSec: number | null) {
    const seeks: number[] = [];
    const onRequest = (event: Event) => {
        const d = (event as CustomEvent).detail;
        let handled = false;
        let payload: Record<string, unknown> | null = null;
        if (d.command === 'prime.state' && positionSec !== null) { handled = true; payload = { timeSeconds: positionSec, durationSeconds: 3317 }; }
        if (d.command === 'prime.seek' && positionSec !== null) { handled = true; seeks.push(d.payload.timeSeconds); }
        window.dispatchEvent(new CustomEvent('watchpizzaparty:bridge:response', {
            detail: { namespace: 'watchpizzaparty-bridge-v1', direction: 'to-content', id: d.id, handled, payload },
        }));
    };
    window.addEventListener('watchpizzaparty:bridge:request', onRequest);
    return { seeks, stop: () => window.removeEventListener('watchpizzaparty:bridge:request', onRequest) };
}

const PAGE = 'https://www.primevideo.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP';
const loc = (href = PAGE) => new URL(href) as unknown as Location;
const always = () => true;

/** The Prime page as measured: a background trailer and, inside #dv-web-player, the episode. */
function page(o: { open?: boolean } = {}) {
    document.body.innerHTML = `
        <video id="trailer"></video>
        <a data-testid="dp-atf-play-button" href="#">Play</a>
        ${o.open === false ? '' : '<div id="dv-web-player"><div><video id="episode"></video></div><div id="controls"></div></div>'}`;
    const fake = (el: HTMLVideoElement | null, duration: number) => {
        if (!el) return null;
        const state = { currentTime: 0, paused: false };
        Object.defineProperty(el, 'duration', { get: () => duration, configurable: true });
        Object.defineProperty(el, 'currentTime', { get: () => state.currentTime, set: (v: number) => { state.currentTime = v; } });
        Object.defineProperty(el, 'paused', { get: () => state.paused });
        Object.defineProperty(el, 'readyState', { get: () => 4 });
        el.play = vi.fn(async () => { state.paused = false; });
        el.pause = vi.fn(() => { state.paused = true; });
        return state;
    };
    fake(document.querySelector<HTMLVideoElement>('#trailer'), 117);
    const episode = fake(document.querySelector<HTMLVideoElement>('#episode'), 3357);
    const controls = document.querySelector('#controls');
    return {
        episode: episode!,
        showAd: (remaining: string | null) => {
            document.querySelector('.atvwebplayersdk-ad-timer-remaining-time')?.remove();
            if (remaining) controls!.insertAdjacentHTML('beforeend', `<span class="atvwebplayersdk-ad-timer-remaining-time">${remaining}</span>`);
        },
        showControls: (elapsed: string, remaining: string) => {
            controls!.innerHTML = `<div class="atvwebplayersdk-title-text">Carrie</div><div class="atvwebplayersdk-subtitle-text">S1 E1 First Period</div><span>${elapsed}</span><span>${remaining}</span>`;
        },
    };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('Prime Video adapter', () => {
    it('knows the episode from the page address', () => {
        page();
        expect(createPrimeAdapter(document, loc(), always).media()).toEqual({ platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP' });
    });

    it('reads the episode inside the player, not the background trailer, and takes ads out of the time', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        p.showAd('0:40');
        p.episode.currentTime = 0;
        expect(prime.snapshot()).toMatchObject({ inAd: true });
        p.showAd('0:22');
        p.episode.currentTime = 18;
        expect(prime.snapshot()).toMatchObject({ inAd: true });
        p.showAd(null);
        p.episode.currentTime = 40;
        prime.snapshot();
        p.episode.currentTime = 127.3;
        expect(prime.snapshot()!.positionSec).toBeCloseTo(87.3, 0);
    });

    it('small corrections (under 10 s) move the video directly, adding the ads back', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        p.episode.currentTime = 127.3;
        p.showControls('01:27', '53:50');
        prime.snapshot();
        prime.seek(92.5); // 5 s ahead in episode time
        expect(p.episode.currentTime).toBeCloseTo(132.3, 0);
    });

    describe('big jumps go through Prime’s own arrow keys (direct jumps can break its player)', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('presses → once per 10 s, spaced out, and reports catching up meanwhile', () => {
            const p = page();
            const prime = createPrimeAdapter(document, loc(), always);
            const keys: string[] = [];
            document.querySelector('#dv-web-player')!.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
            p.episode.currentTime = 100;
            prime.snapshot();
            prime.seek(160); // 60 s ahead
            expect(p.episode.currentTime).toBe(100); // never set directly
            expect(prime.snapshot()!.buffering).toBe(true);
            vi.advanceTimersByTime(6 * 300 + 50);
            expect(keys).toEqual(Array(6).fill('ArrowRight'));
            vi.advanceTimersByTime(2000);
            expect(prime.snapshot()!.buffering).toBe(false);
        });

        it('pauses and covers the player while it jumps, then uncovers it', () => {
            const p = page();
            const prime = createPrimeAdapter(document, loc(), always);
            p.episode.currentTime = 100;
            prime.snapshot();
            prime.seek(200);
            expect(p.episode.paused).toBe(true);
            expect(document.querySelector('[data-wpp-catching-up]')?.textContent).toContain('Catching up with the host');
            vi.advanceTimersByTime(10 * 300 + 2000);
            prime.snapshot();
            expect(document.querySelector('[data-wpp-catching-up]')).toBeNull();
        });

        it('jumps back with ←, and a new jump replaces one in progress', () => {
            const p = page();
            const prime = createPrimeAdapter(document, loc(), always);
            const keys: string[] = [];
            document.querySelector('#dv-web-player')!.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
            p.episode.currentTime = 500;
            prime.snapshot();
            prime.seek(200); // 30 presses back
            vi.advanceTimersByTime(3 * 300);
            prime.seek(470); // changed mind: only 3 back from here
            vi.advanceTimersByTime(20 * 300);
            expect(keys.every((k) => k === 'ArrowLeft')).toBe(true);
            expect(keys.length).toBeGreaterThanOrEqual(4);
            expect(keys.length).toBeLessThanOrEqual(3 + 1 + 3);
            expect(p.episode.currentTime).toBe(500);
        });
    });

    it('shows title and episode from the player, and keeps them when the controls hide', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        p.showControls('00:05', '55:12');
        prime.snapshot();
        document.querySelector('#controls')!.innerHTML = '';
        prime.snapshot();
        expect(prime.title()).toBe('Carrie · S1 E1 First Period');
    });

    it('with the player closed it has no snapshot, and open() presses the page Play button once', () => {
        page({ open: false });
        const prime = createPrimeAdapter(document, loc(), always);
        const click = vi.fn();
        document.querySelector('[data-testid="dp-atf-play-button"]')!.addEventListener('click', (e) => { e.preventDefault(); click(); });
        expect(prime.snapshot()).toBeNull();
        prime.open!();
        prime.open!();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('play and pause act on the episode', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        prime.pause();
        expect(prime.snapshot()!.paused).toBe(true);
        prime.play();
        expect(p.episode.paused).toBe(false);
    });

    it('forgets the old title when another film starts', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        p.showControls('00:05', '55:12');
        prime.snapshot();
        expect(prime.title()).toBe('Carrie · S1 E1 First Period');
        document.querySelector('#controls')!.innerHTML = '';
        Object.defineProperty(document.querySelector('#episode')!, 'duration', { get: () => 4419 });
        prime.snapshot();
        expect(prime.title() ?? '').not.toMatch(/Carrie/);
    });

    describe('with Prime’s own player store (via the page bridge)', () => {
        it('uses Prime’s exact episode time — no calibration click needed', () => {
            const p = page();
            const bridge = fakePrimeBridge(600);
            const prime = createPrimeAdapter(document, loc(), always);
            p.episode.currentTime = 1864; // video clock incl. unseen ads
            expect(prime.snapshot()!.positionSec).toBe(600);
            expect(prime.needsUserClick!()).toBe(false);
            bridge.stop();
        });

        it('big jumps are one step through Prime, no arrow keys, no cover', () => {
            const p = page();
            const bridge = fakePrimeBridge(600);
            const prime = createPrimeAdapter(document, loc(), always);
            const keys: string[] = [];
            document.querySelector('#dv-web-player')!.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
            prime.snapshot();
            prime.seek(1800);
            expect(bridge.seeks).toEqual([1800]);
            expect(keys).toEqual([]);
            expect(document.querySelector('[data-wpp-catching-up]')).toBeNull();
            expect(p.episode.paused).toBe(false);
            bridge.stop();
        });
    });
});
