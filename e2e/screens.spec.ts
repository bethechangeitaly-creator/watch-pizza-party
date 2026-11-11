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
        await host.panel.getByText('Movie night, together 🍕').waitFor();
        await host.panel.screenshot({ path: out('landing-dark') });
        await host.panel.emulateMedia({ colorScheme: 'light' });
        await host.panel.waitForTimeout(400);
        await host.panel.screenshot({ path: out('landing-light') });
        await host.panel.emulateMedia({ colorScheme: 'dark' });

        const roomId = await createParty(host);
        await viewer.page.goto('https://example.com/');
        await joinParty(viewer, roomId, '*://example.com/*');
        const viewerVideo = await videoPage(viewer);
        await panelRequest(host, { type: 'chat.send', text: 'Popcorn ready? Starting in 10 seconds' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Ready! 🍕' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Turn it up' });
        await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.play());
        await host.panel.waitForTimeout(3000);

        await host.panel.emulateMedia({ colorScheme: 'light' });
        await host.panel.waitForTimeout(400); // let colour transitions finish
        await host.panel.screenshot({ path: out('room-host-light') });
        await host.panel.emulateMedia({ colorScheme: 'dark' });
        await host.panel.waitForTimeout(400);
        await host.panel.screenshot({ path: out('room-host-night') });
        await viewer.panel.emulateMedia({ colorScheme: 'dark' });
        await viewer.panel.waitForTimeout(400);
        await viewer.panel.screenshot({ path: out('room-viewer-night') });
        await viewer.panel.emulateMedia({ colorScheme: 'light' });
        await viewer.panel.waitForTimeout(400);
        await viewer.panel.screenshot({ path: out('room-viewer-light') });

        // Every section open on a short panel: the chat and composer must stay visible.
        await host.panel.emulateMedia({ colorScheme: 'light' });
        await host.panel.getByRole('button', { name: /^People/ }).click();
        await host.panel.getByRole('button', { name: /^Volume boost/ }).click();
        await host.panel.setViewportSize({ width: 400, height: 600 });
        await host.panel.waitForTimeout(400);
        await host.panel.screenshot({ path: out('room-all-open-short') });
        await host.panel.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });

        await host.panel.getByRole('button', { name: 'Menu' }).click();
        await host.panel.waitForTimeout(300);
        await host.panel.screenshot({ path: out('menu') });
        await host.panel.keyboard.press('Escape');

        // The toolbar popup, rendered in a tab at popup size.
        const popup = await host.context.newPage();
        await popup.setViewportSize({ width: 300, height: 300 });
        await popup.emulateMedia({ colorScheme: 'light' });
        await popup.goto(`chrome-extension://${host.extensionId}/popup.html`);
        await popup.getByRole('button', { name: 'Open full sidebar' }).waitFor();
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
