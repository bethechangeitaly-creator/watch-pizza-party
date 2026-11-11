import * as path from 'path';
import { VIDEO, createParty, joinParty, launchMember, panelRequest, test, waitNoAd } from './fixtures';

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
        await host.panel.getByText('Watch together, in sync.').waitFor();
        await host.panel.screenshot({ path: out('landing-dark') });
        await host.panel.emulateMedia({ colorScheme: 'light' });
        await host.panel.waitForTimeout(400);
        await host.panel.screenshot({ path: out('landing-light') });
        await host.panel.emulateMedia({ colorScheme: 'dark' });

        const roomId = await createParty(host);
        await viewer.page.goto('https://example.com/');
        await joinParty(viewer, roomId, '*://example.com/*');
        await viewer.page.waitForURL(/watch/);
        await panelRequest(host, { type: 'chat.send', text: 'Popcorn ready? Starting in 10 seconds' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Ready! 🍕' });
        await panelRequest(viewer, { type: 'chat.send', text: 'Turn it up' });
        await host.page.evaluate(() => document.querySelector<HTMLVideoElement>('video.html5-main-video')!.play());
        await host.panel.waitForTimeout(3000);

        await host.panel.screenshot({ path: out('room-host') });
        await viewer.panel.emulateMedia({ colorScheme: 'dark' });
        await viewer.panel.waitForTimeout(500);
        await viewer.panel.screenshot({ path: out('room-viewer') });
        await viewer.panel.emulateMedia({ colorScheme: 'light' });
        await viewer.panel.waitForTimeout(400); // let colour transitions finish
        await viewer.panel.screenshot({ path: out('room-viewer-light') });

        await host.panel.getByRole('button', { name: 'Menu' }).click();
        await host.panel.waitForTimeout(300);
        await host.panel.screenshot({ path: out('menu') });
        await host.panel.keyboard.press('Escape');
        await host.panel.getByRole('button', { name: /watching/ }).click();
        await host.panel.waitForTimeout(300);
        await host.panel.screenshot({ path: out('people') });

        // The bubble only appears once the panel is closed.
        await viewer.panel.close();
        await viewer.page.bringToFront();
        await viewer.page.waitForSelector('wpp-bubble', { state: 'visible', timeout: 10_000 });
        await viewer.page.screenshot({ path: out('bubble'), clip: { x: 1280 - 200, y: 250, width: 200, height: 250 } });
    } finally {
        await host.context.close();
        await viewer.context.close();
    }
});
