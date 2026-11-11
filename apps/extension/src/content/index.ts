import type { BackgroundToContent, ContentToBackground } from '../lib/messages';
import { adapterFor } from './adapters';
import { isAlive, markAlive, runtimeAlive } from './alive';
import { createBubble } from './bubble';
// Embedded in the script, so the logo still shows after the extension is reloaded or updated.
import iconUrl from '../../public/icon32.png?inline';
import { HostReporter } from './hostReporter';
import { ViewerFollower } from './viewerFollower';

const TICK_MS = 250;

(() => {
    const scope = globalThis as unknown as Record<string, unknown>;
    if (isAlive(scope) || window.top !== window) return; // a live copy is already running
    markAlive(scope, runtimeAlive);

    let timer: ReturnType<typeof setInterval> | null = null;
    let reporter: HostReporter | null = null;
    let follower: ViewerFollower | null = null;
    let bubble: ReturnType<typeof createBubble> | null = null;

    const send = (message: ContentToBackground) => {
        try {
            chrome.runtime.sendMessage(message).catch(() => {});
        } catch {
            stop(); // The extension was reloaded; this script is orphaned.
        }
    };

    function stop(): void {
        if (timer) clearInterval(timer);
        timer = null;
        reporter = null;
        follower = null;
    }

    function start(role: 'host' | 'viewer'): void {
        stop();
        const adapter = adapterFor(location, document);
        if (!adapter) return;
        if (role === 'host') {
            reporter = new HostReporter(adapter, (event) => send({ type: 'content.hostEvent', event }), Date.now);
        } else {
            follower = new ViewerFollower(adapter, (status) => send({ type: 'content.viewerStatus', ...status }), Date.now);
        }
        // Only an active party runs a timer; every other YouTube/Netflix tab stays idle.
        timer = setInterval(() => {
            reporter?.tick();
            follower?.tick();
        }, TICK_MS);
    }

    chrome.runtime.onMessage.addListener((message: BackgroundToContent) => {
        switch (message.type) {
            case 'bg.activate':
                start(message.role);
                break;
            case 'bg.deactivate':
                stop();
                break;
            case 'bg.timeline':
                follower?.setTimeline(message.timeline, message.clockOffsetMs, message.force);
                break;
            case 'bg.clock':
                follower?.setClock(message.clockOffsetMs);
                break;
            case 'bg.bubble':
                if (!bubble && !message.bubble.visible) break;
                bubble ??= createBubble(
                    document,
                    {
                        onOpen: () => send({ type: 'content.openPanel' }),
                        onDismiss: () => send({ type: 'content.dismissBubble' }),
                    },
                    localStorage,
                    iconUrl,
                );
                bubble.render(message.bubble);
                break;
            default:
                break;
        }
    });

    send({ type: 'content.hello', url: location.href });
})();
