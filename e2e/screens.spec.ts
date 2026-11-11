import * as path from 'path';
import { VIDEO, createParty, joinParty, launchMember, panelRequest, test, videoPage, waitNoAd } from './fixtures';

const out = (name: string) => path.join(import.meta.dirname, 'screenshots', `${name}.png`);

test('panel screenshots', async () => {
    const host = await launchMember();
    const viewer = await launchMember();
    try {
        // Landing on a video tab, dark and light.
        await host.page.goto(VIDEO);
        await waitNoAd(host.page);
        await host.page.bringToFront();
        await host.panel.emulateMedia({ colorScheme: 'dark' });
        await host.panel.reload();
        await host.panel.getByText('Sync & Watch Together').waitFor();
        await host.panel.screenshot({ path: out('landing-dark') });

        const roomId = await createParty(host);
        await viewer.page.goto('https://example.com/');
        await joinParty(viewer, roomId, '*://example.com/*');
        const viewerVideo = await videoPage(viewer);
        await panelRequest(host, { type: 'chat.send', text: 'Popcorn ready? Starting in 10 seconds' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Ready! 🍕' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Turn it up' });
        await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.play());
        await host.panel.waitForTimeout(3000);

        const toLight = (m: typeof host) => m.panel.getByRole('button', { name: 'Switch to light mode (work / YouTube)' }).click();
        const toNight = (m: typeof host) => m.panel.getByRole('button', { name: 'Switch to dark mode (cinema / Netflix)' }).click();
        await host.panel.screenshot({ path: out('room-host-night') });
        await viewer.panel.screenshot({ path: out('room-viewer-night') });
        await toLight(host);
        await toLight(viewer);
        await host.panel.waitForTimeout(400); // let colour transitions finish
        await host.panel.screenshot({ path: out('room-host-light') });
        await viewer.panel.screenshot({ path: out('room-viewer-light') });

        // Every section open on a short panel: the chat and composer must stay visible.
        await host.panel.getByRole('button', { name: /^Participants/ }).click();
        await host.panel.getByRole('button', { name: /^Volume Boost/ }).click();
        await host.panel.setViewportSize({ width: 400, height: 600 });
        await host.panel.waitForTimeout(400);
        await host.panel.screenshot({ path: out('room-all-open-short') });
        await host.panel.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });

        await host.panel.getByRole('button', { name: 'About & Guide' }).click();
        await host.panel.waitForTimeout(300);
        await host.panel.screenshot({ path: out('about') });
        await host.panel.keyboard.press('Escape');
        await toNight(host);

        // The toolbar popup, rendered in a tab at popup size.
        const popup = await host.context.newPage();
        await popup.setViewportSize({ width: 300, height: 300 });
        await popup.emulateMedia({ colorScheme: 'light' });
        await popup.goto(`chrome-extension://${host.extensionId}/popup.html`);
        await popup.getByRole('button', { name: 'Open Full Sidebar' }).waitFor();
        await popup.screenshot({ path: out('popup-party') });
        await popup.close();

        // The bubble only appears once the panel is closed.
        await viewer.panel.close();
        await viewerVideo.bringToFront();
        await viewerVideo.waitForSelector('wpp-bubble', { state: 'visible', timeout: 10_000 });
        await viewerVideo.screenshot({ path: out('bubble'), clip: { x: 1280 - 200, y: 250, width: 200, height: 250 } });
    } finally {
        await host.context.close();
        await viewer.context.close();
    }
});
