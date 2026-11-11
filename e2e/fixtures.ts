import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'crypto';
import * as path from 'path';

export const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Big Buck Bunny (CC-BY)
const DIST = path.resolve(import.meta.dirname, '../apps/extension/dist');

export type Member = { context: BrowserContext; extensionId: string; page: Page; panel: Page };

/** Chrome's id for an unpacked extension: sha256 of its path, hex mapped to a–p. */
const unpackedId = (dir: string) =>
    [...createHash('sha256').update(dir).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

/** allowCapture: Chromium's test switch that lets tabCapture skip the toolbar click, so volume boost can be tested. */
export async function launchMember(opts: { allowCapture?: boolean; audible?: boolean } = {}): Promise<Member> {
    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: !opts.audible,
        viewport: { width: 1280, height: 800 },
        args: [
            `--disable-extensions-except=${DIST}`,
            `--load-extension=${DIST}`,
            '--autoplay-policy=no-user-gesture-required',
            // Headless Chromium plays no audio, so the loudness test runs headed, off-screen.
            ...(opts.audible ? ['--window-position=-2400,-2400'] : ['--mute-audio']),
            ...(opts.allowCapture ? [`--allowlisted-extension-id=${unpackedId(DIST)}`] : []),
        ],
    });
    // Skip YouTube's EU cookie-consent interstitial.
    await context.addCookies([
        { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true },
        { name: 'CONSENT', value: 'YES+', domain: '.youtube.com', path: '/', secure: true },
    ]);
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const page = context.pages()[0] ?? (await context.newPage());
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 400, height: 800 });
    await panel.goto(`chrome-extension://${extensionId}/index.html`);
    return { context, extensionId, page, panel };
}

/** Sends a PanelRequest from the panel page, the way the real side panel does. */
export async function panelRequest(m: Member, request: Record<string, unknown>) {
    return m.panel.evaluate((r) => chrome.runtime.sendMessage(r), request);
}

export async function tabIdFor(m: Member, urlPattern: string): Promise<number> {
    const id = await m.panel.evaluate(async (pattern) => (await chrome.tabs.query({ url: pattern }))[0]?.id ?? null, urlPattern);
    if (id === null) throw new Error(`no tab matches ${urlPattern}`);
    return id;
}

export async function sessionOf(m: Member) {
    const response = (await panelRequest(m, { type: 'session.get' })) as { ok: boolean; state: { status: string; roomId: string | null; isHost: boolean } };
    return response.state;
}

export async function createParty(host: Member): Promise<string> {
    const tabId = await tabIdFor(host, '*://*.youtube.com/*');
    await panelRequest(host, { type: 'session.create', username: 'Host', tabId });
    await expect.poll(async () => (await sessionOf(host)).status, { timeout: 30_000 }).toBe('joined');
    return (await sessionOf(host)).roomId!;
}

export async function joinParty(viewer: Member, roomId: string, urlPattern: string) {
    const tabId = await tabIdFor(viewer, urlPattern);
    await panelRequest(viewer, { type: 'session.join', roomId, username: 'Viewer', tabId });
    await expect.poll(async () => (await sessionOf(viewer)).status, { timeout: 30_000 }).toBe('joined');
}

/** The tab the party opened the host's video in (joining from another site opens a new tab). */
export async function videoPage(m: Member, timeoutMs = 20_000): Promise<Page> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const page = m.context.pages().find((p) => /watch\?v=aqz-KE-bpKQ/.test(p.url()));
        if (page) return page;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('the party video never opened');
}

export async function waitNoAd(page: Page) {
    await page.waitForSelector('video.html5-main-video', { timeout: 30_000 });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const inAd = await page.evaluate(() => document.querySelector('#movie_player')?.classList.contains('ad-showing') ?? false);
        if (!inAd) return;
        await page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').first().click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(500);
    }
    throw new Error('ad did not finish in 60s');
}

export const currentTime = (page: Page) => page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')?.currentTime ?? -1);
export const isPlaying = (page: Page) => page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    return !!v && !v.paused;
});

/** Median |host − viewer| over 5 near-simultaneous reads. */
export async function driftBetween(a: Page, b: Page): Promise<number> {
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
        const [ta, tb] = await Promise.all([currentTime(a), currentTime(b)]);
        samples.push(Math.abs(ta - tb));
        await a.waitForTimeout(100);
    }
    samples.sort((x, y) => x - y);
    return samples[2];
}

export const test = base.extend<{ party: { host: Member; viewer: Member } }>({
    party: async ({}, use) => {
        const host = await launchMember();
        const viewer = await launchMember();
        await use({ host, viewer });
        await host.context.close();
        await viewer.context.close();
    },
});
export { expect };
