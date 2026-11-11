// Opens a separate Chrome window with the extension and joins a party as a second person.
// Usage: npm run join --workspace=@watch-party/e2e -- <ROOM_CODE> [extension folder]
import { chromium } from '@playwright/test';
import * as path from 'path';

const [roomId, extArg] = process.argv.slice(2);
if (!roomId) {
    console.error('usage: join-party.mjs <ROOM_CODE> [extension folder]');
    process.exit(1);
}
const extension = path.resolve(extArg ?? path.join(import.meta.dirname, '../../release/test-extension'));

const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: null,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required'],
});
await context.addCookies([
    { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true },
    { name: 'CONSENT', value: 'YES+', domain: '.youtube.com', path: '/', secure: true },
]);
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

const start = context.pages()[0] ?? (await context.newPage());
await start.goto('https://example.com/');
const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 800 });
await panel.goto(`chrome-extension://${extensionId}/index.html`);

const request = (r) => panel.evaluate((x) => chrome.runtime.sendMessage(x), r);
const tabId = await panel.evaluate(async () => (await chrome.tabs.query({ url: '*://example.com/*' }))[0].id);
console.log(`joining ${roomId} as "Claude (test viewer)"…`);
await request({ type: 'session.join', roomId, username: 'Claude (test viewer)', tabId });

const log = async () => {
    const { state } = await request({ type: 'session.get' });
    const video = context.pages().find((p) => /youtube\.com\/watch|netflix\.com\/watch/.test(p.url()));
    const player = video
        ? await video.evaluate(() => {
              const v = document.querySelector('video');
              return v ? { time: Number(v.currentTime.toFixed(2)), paused: v.paused } : null;
          }).catch(() => null)
        : null;
    console.log(JSON.stringify({
        at: new Date().toLocaleTimeString(),
        status: state.status,
        error: state.error?.message ?? null,
        host: state.room?.participants.find((p) => p.id === state.room.hostId)?.username ?? null,
        people: state.room?.participants.length ?? 0,
        mySync: state.mySync,
        video: video ? video.url() : null,
        player,
    }));
};
await log();
setInterval(() => void log().catch((e) => console.log('log error', e.message)), 5000);
context.on('close', () => process.exit(0));
