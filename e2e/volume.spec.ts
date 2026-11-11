import { VIDEO, createParty, expect, launchMember, panelRequest, sessionOf, test, waitNoAd } from './fixtures';

// Chrome normally needs a click on the toolbar icon before it allows tab capture. The test switch
// skips that one step, so this checks everything after it: capture → offscreen → gain.
test('volume boost captures the video tab and changes the gain', async () => {
    const host = await launchMember({ allowCapture: true });
    try {
        await host.page.goto(VIDEO);
        await waitNoAd(host.page);
        await host.page.bringToFront();
        await createParty(host);
        await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.play());

        const set = (await panelRequest(host, { type: 'volume.set', gain: 2 })) as { ok: boolean; error?: string };
        expect(set, JSON.stringify(set)).toMatchObject({ ok: true });
        await expect.poll(async () => ((await sessionOf(host)) as unknown as { volumeReady: boolean }).volumeReady).toBe(true);

        const ping = (await panelRequest(host, { target: 'offscreen', type: 'OFFSCREEN_PING' })) as Record<string, unknown>;
        expect(ping).toMatchObject({ capturing: true });
        expect(ping.contextState).toBe('running');
        expect(ping.gain).toBe(2);
    } finally {
        await host.context.close();
    }
});
