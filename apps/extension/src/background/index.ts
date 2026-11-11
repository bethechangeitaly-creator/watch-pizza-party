import type { SyncRequestReason, Timeline } from '@watch-party/shared';
import type { BackgroundEvent, PanelRequest, PanelResponse, TimelineEntry } from '../lib/messages';
import { ServerConnection } from './connection';
import { createRoomWithRetry } from './createRoom';
import { SessionController } from './sessionController';
import { migrateLegacyKeys, sessionKey, type KeyValueArea } from './sessionStore';
import { SERVER_URL_KEY, loadServerUrl, normalizeServerUrl } from './serverUrl';

const storage = chrome.storage.local as unknown as KeyValueArea;
let serverUrl = '';

function broadcast(event: BackgroundEvent): void {
    chrome.runtime.sendMessage(event).catch(() => {
        // No panel open — nothing is listening.
    });
}

function handleTimeline(_timeline: Timeline, _force: boolean): void {}
function handleEntries(_entries: TimelineEntry[], _replace: boolean): void {}
function handleHostRequest(_reason: SyncRequestReason): void {}
function handleClock(_offsetMs: number): void {}

const controller = new SessionController({
    storage,
    storageKey: sessionKey(chrome.extension.inIncognitoContext),
    now: Date.now,
    serverUrl: () => serverUrl,
    connectionFactory: (url, handlers) => new ServerConnection({ url, handlers }),
    createRoom: ({ baseUrl, username, onWaking }) =>
        createRoomWithRetry({
            baseUrl,
            username,
            onWaking,
            fetchImpl: (input, init) => fetch(input, init),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: Date.now,
        }),
    getTab: async (tabId) => {
        try {
            const tab = await chrome.tabs.get(tabId);
            return { title: tab.title ?? '' };
        } catch {
            return null;
        }
    },
    emit: (state) => broadcast({ type: 'bg.session', state }),
    onTimeline: (t, force) => handleTimeline(t, force),
    onEntries: (entries, replace) => handleEntries(entries, replace),
    onHostRequest: (reason) => handleHostRequest(reason),
    onClock: (offset) => handleClock(offset),
});

async function tabTitle(tabId: number): Promise<string> {
    try {
        return (await chrome.tabs.get(tabId)).title ?? '';
    } catch {
        return '';
    }
}

const ok = (): PanelResponse => ({ ok: true, state: controller.state() });
const fail = (error: string, code?: string): PanelResponse => ({ ok: false, error, ...(code ? { code } : {}) });

async function handlePanelRequest(req: PanelRequest): Promise<PanelResponse> {
    switch (req.type) {
        case 'session.get':
            return ok();
        case 'session.create':
            await controller.create(req.username, req.tabId, await tabTitle(req.tabId));
            return ok();
        case 'session.join':
            await controller.join(req.roomId, req.username, req.tabId, await tabTitle(req.tabId));
            return ok();
        case 'session.leave':
            await controller.leave();
            return ok();
        case 'session.useTab':
            await controller.useTab(req.tabId, await tabTitle(req.tabId));
            return ok();
        case 'chat.send':
            controller.send({ type: 'chat.send', payload: { text: req.text } });
            return ok();
        case 'sync.force':
            controller.send({ type: 'sync.force', payload: {} });
            return ok();
        case 'sync.request':
            controller.send({ type: 'sync.request', payload: { reason: req.reason } });
            return ok();
        case 'server.setUrl': {
            const status = controller.state().status;
            if (status !== 'idle' && status !== 'error') return fail('Leave the party before changing the server.');
            try {
                serverUrl = normalizeServerUrl(req.url);
            } catch (error) {
                return fail(error instanceof Error ? error.message : String(error));
            }
            await storage.set({ [SERVER_URL_KEY]: serverUrl });
            controller.refresh();
            return ok();
        }
        default:
            return fail('Unsupported request.');
    }
}

const PANEL_REQUEST_TYPES = new Set<PanelRequest['type']>([
    'session.get', 'session.create', 'session.join', 'session.leave', 'session.useTab', 'chat.send',
    'sync.force', 'sync.request', 'sync.resyncMe', 'server.setUrl', 'panel.minimize',
    'volume.start', 'volume.setGain', 'volume.stop',
]);

function isPanelRequest(raw: unknown): raw is PanelRequest {
    return typeof raw === 'object' && raw !== null && PANEL_REQUEST_TYPES.has((raw as { type: PanelRequest['type'] }).type);
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const fromExtensionPage = sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
    if (fromExtensionPage && isPanelRequest(raw)) {
        handlePanelRequest(raw)
            .then(sendResponse)
            .catch((error) => sendResponse(fail(error instanceof Error ? error.message : String(error))));
        return true;
    }
    return false;
});

let openPanels = 0;
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'wpp-panel') return;
    openPanels += 1;
    controller.setPanelOpen(true);
    port.onDisconnect.addListener(() => {
        openPanels = Math.max(0, openPanels - 1);
        if (openPanels === 0) controller.setPanelOpen(false);
    });
});

async function bootstrap(): Promise<void> {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    serverUrl = await loadServerUrl(storage);
    await migrateLegacyKeys(storage);
    await controller.restore();
}

void bootstrap();
