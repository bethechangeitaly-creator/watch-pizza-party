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

        // The boost must really be louder: output vs input level, measured at the same moment.
        const boostDb = async () => {
            const diffs: number[] = [];
            for (let i = 0; i < 20; i++) {
                const p = (await panelRequest(host, { target: 'offscreen', type: 'OFFSCREEN_PING' })) as { levelDb: number | null; inputDb: number | null };
                if (typeof p.levelDb === 'number' && typeof p.inputDb === 'number' && p.inputDb > -60) diffs.push(p.levelDb - p.inputDb);
                await host.page.waitForTimeout(100);
            }
            expect(diffs.length, 'there is real audio to measure').toBeGreaterThan(5);
            return diffs.reduce((a, b) => a + b, 0) / diffs.length;
        };
        const results: Record<string, number> = {};
        for (const gain of [1, 2, 4, 6]) {
            await panelRequest(host, { type: 'volume.set', gain });
            await host.page.waitForTimeout(300);
            results[`${gain * 100}%`] = Math.round((await boostDb()) * 10) / 10;
        }
        console.log('BOOST dB', JSON.stringify(results));
        expect(Math.abs(results['100%'])).toBeLessThan(1); // 100 % leaves the sound unchanged
        expect(results['400%']).toBeGreaterThan(12);
        expect(results['600%']).toBeGreaterThan(18); // loud mode: well beyond a plain 6× gain (+15.6 dB)
    } finally {
        await host.context.close();
    }
});
