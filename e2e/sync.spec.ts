import { VIDEO, createParty, driftBetween, expect, isPlaying, joinParty, panelRequest, sessionOf, test, waitNoAd } from './fixtures';

test('viewer follows host play, seek and pause', async ({ party }) => {
    const { host, viewer } = party;
    await host.page.goto(VIDEO);
    await waitNoAd(host.page);
    await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.pause());
    const roomId = await createParty(host);

    await viewer.page.goto('https://example.com/');
    await joinParty(viewer, roomId, '*://example.com/*');
    await expect(viewer.page).toHaveURL(/watch\?v=aqz-KE-bpKQ/, { timeout: 20_000 });
    await waitNoAd(viewer.page);

    await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.play());
    await expect.poll(() => isPlaying(viewer.page), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => driftBetween(host.page, viewer.page), { timeout: 15_000 }).toBeLessThan(0.5);

    await host.page.evaluate(() => { document.querySelector<HTMLVideoElement>('video.html5-main-video')!.currentTime = 120; });
    await expect.poll(() => driftBetween(host.page, viewer.page), { timeout: 10_000 }).toBeLessThan(1.0);

    await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.pause());
    await expect.poll(() => isPlaying(viewer.page), { timeout: 5_000 }).toBe(false);
    await expect.poll(() => driftBetween(host.page, viewer.page), { timeout: 5_000 }).toBeLessThan(0.3);
});

test('viewer joining later gets chat history', async ({ party }) => {
    const { host, viewer } = party;
    await host.page.goto(VIDEO);
    const roomId = await createParty(host);
    await panelRequest(host, { type: 'chat.send', text: 'hello from the host' });
    await expect(host.panel.getByText('hello from the host')).toBeVisible();

    await viewer.page.goto('https://example.com/');
    await joinParty(viewer, roomId, '*://example.com/*');
    await expect(viewer.panel.getByText('hello from the host')).toBeVisible();
});

test('closing the viewer media tab navigates nothing else', async ({ party }) => {
    const { host, viewer } = party;
    await host.page.goto(VIDEO);
    const roomId = await createParty(host);
    await viewer.page.goto('https://example.com/');
    await joinParty(viewer, roomId, '*://example.com/*');
    await expect(viewer.page).toHaveURL(/watch\?v=aqz-KE-bpKQ/, { timeout: 20_000 });

    const other = await viewer.context.newPage();
    await other.goto('https://example.org/');
    await other.bringToFront();
    await viewer.page.close();
    await expect.poll(async () => (await sessionOf(viewer)).status).toBe('joined');

    await waitNoAd(host.page);
    await host.page.evaluate(() => { document.querySelector<HTMLVideoElement>('video.html5-main-video')!.currentTime = 200; });
    await other.waitForTimeout(3000);
    expect(other.url()).toBe('https://example.org/');
    await expect(viewer.panel.getByText('Pick a tab to watch in')).toBeVisible();
});
