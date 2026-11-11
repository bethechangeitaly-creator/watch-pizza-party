import { VIDEO, createParty, expect, launchMember, panelRequest, sessionOf, test, waitNoAd } from './fixtures';

// Chrome normally needs a click on the toolbar icon before it allows tab capture. The test switch
// skips that one step, so this checks everything after it: capture → offscreen → gain.
test('volume boost captures the video tab and changes the gain', async () => {
    const host = await launchMember({ allowCapture: true, audible: true });
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
        expect(ping.sampleRate).toBe(48000);

        // The boost must really be louder: average output level at 100 % vs 400 %.
        const level = async () => {
            const samples: number[] = [];
            for (let i = 0; i < 20; i++) {
                const p = (await panelRequest(host, { target: 'offscreen', type: 'OFFSCREEN_PING' })) as { levelDb: number | null };
                if (typeof p.levelDb === 'number' && Number.isFinite(p.levelDb)) samples.push(p.levelDb);
                await host.page.waitForTimeout(100);
            }
            return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
        };
        await panelRequest(host, { type: 'volume.set', gain: 1 });
        await host.page.waitForTimeout(5000); // the film's first seconds are almost silent
        const normal = await level();
        await panelRequest(host, { type: 'volume.set', gain: 4 });
        const boosted = await level();
        console.log(`VOLUME 100% ${normal.toFixed(1)} dB → 400% ${boosted.toFixed(1)} dB`);
        expect(normal).toBeLessThan(-10); // there is real audio, not silence measured as 0
        expect(boosted - normal).toBeGreaterThan(6);
    } finally {
        await host.context.close();
    }
});
