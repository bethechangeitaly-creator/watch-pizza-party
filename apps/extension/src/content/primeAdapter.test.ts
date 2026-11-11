// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrimeAdapter } from './adapters';

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
        Object.defineProperty(el, 'duration', { get: () => duration });
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

    it('jumps to episode time, adding the ads back', () => {
        const p = page();
        const prime = createPrimeAdapter(document, loc(), always);
        p.episode.currentTime = 127.3;
        p.showControls('01:27', '53:50');
        prime.snapshot();
        prime.seek(200);
        expect(p.episode.currentTime).toBeCloseTo(240, 0);
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
});
