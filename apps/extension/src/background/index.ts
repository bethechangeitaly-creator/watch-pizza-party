import type { SyncRequestReason, Timeline } from '@watch-party/shared';
import {
    parseContentMessage,
    type BackgroundEvent,
    type BackgroundToContent,
    type BubbleState,
    type ContentToBackground,
    type PanelRequest,
    type PanelResponse,
    type PublicSession,
    type TimelineEntry,
} from '../lib/messages';
import { planViewerNavigation, shouldAcceptHostEvent } from './mediaTab';
import { ServerConnection } from './connection';
import { createRoomWithRetry } from './createRoom';
import { SessionController } from './sessionController';
import { migrateLegacyKeys, sessionKey, type KeyValueArea } from './sessionStore';
import { SERVER_URL_KEY, loadServerUrl, normalizeServerUrl } from './serverUrl';

const storage = chrome.storage.local as unknown as KeyValueArea;
let serverUrl = '';
let openPanels = 0;

function broadcast(event: BackgroundEvent): void {
    chrome.runtime.sendMessage(event).catch(() => {
        // No panel open — nothing is listening.
    });
}

function sendToTab(tabId: number, message: BackgroundToContent): void {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {
        // The page has no content script (yet) — it says hello when it boots.
    });
}

// ── Media tab: activation and viewer navigation ───────────────────────────────

let lastNavigatedKey: string | null = null;
let activeContent: { tabId: number; role: 'host' | 'viewer' } | null = null;

function desiredRole(state: PublicSession): 'host' | 'viewer' | null {
    if (state.status !== 'joined' && state.status !== 'reconnecting') return null;
    if (!state.mediaTab || !state.me) return null;
    return state.isHost ? 'host' : 'viewer';
}

/** Keeps exactly the bound media tab's content script active, in the right role. */
function syncContentActivation(state: PublicSession): void {
    const role = desiredRole(state);
    const tabId = state.mediaTab?.tabId ?? null;
    if (activeContent && (activeContent.tabId !== tabId || activeContent.role !== role)) {
        sendToTab(activeContent.tabId, { type: 'bg.deactivate' });
        activeContent = null;
    }
    if (role && tabId !== null && !activeContent) {
        activeContent = { tabId, role };
        activateTab(tabId, role);
    }
}

function activateTab(tabId: number, role: 'host' | 'viewer'): void {
    sendToTab(tabId, { type: 'bg.activate', role });
    const timeline = controller.latestTimeline();
    if (role === 'viewer' && timeline) {
        sendToTab(tabId, { type: 'bg.timeline', timeline, clockOffsetMs: controller.clockOffsetMs(), force: false });
    }
}

async function followTimeline(timeline: Timeline, force: boolean): Promise<void> {
    const state = controller.state();
    if (state.isHost || !state.mediaTab) return;
    const tabId = state.mediaTab.tabId;
    let url: string | undefined;
    try {
        url = (await chrome.tabs.get(tabId)).url;
    } catch {
        return;
    }
    const plan = planViewerNavigation({ timeline, mediaTab: { tabId, url }, lastNavigatedKey, force });
    if (plan.action === 'navigate') {
        lastNavigatedKey = plan.key;
        await chrome.tabs.update(plan.tabId, { url: plan.url }).catch(() => {});
        return; // The new page says hello and then receives the timeline.
    }
    sendToTab(tabId, { type: 'bg.timeline', timeline, clockOffsetMs: controller.clockOffsetMs(), force });
}

function handleTimeline(timeline: Timeline, force: boolean): void {
    void followTimeline(timeline, force);
}
function handleEntries(_entries: TimelineEntry[], _replace: boolean): void {}

// ── Floating bubble (shown in the media tab while the panel is closed) ────────

const REQUEST_BADGE_MS = 10_000;
const dismissedBubbleTabs = new Set<number>();
let lastRequest: { reason: SyncRequestReason; until: number } | null = null;
let bubbleSent: { tabId: number; json: string } | null = null;

function bubbleState(state: PublicSession): BubbleState {
    const inParty = state.status === 'joined' || state.status === 'reconnecting';
    const tabId = state.mediaTab?.tabId;
    return {
        visible: inParty && openPanels === 0 && tabId !== undefined && !dismissedBubbleTabs.has(tabId),
        participants: state.room?.participants.length ?? 0,
        unread: state.unread,
        connected: state.status === 'joined',
        request: lastRequest && lastRequest.until > Date.now() ? lastRequest.reason : null,
    };
}

function pushBubble(): void {
    const state = controller.state();
    const tabId = state.mediaTab?.tabId ?? null;
    if (bubbleSent && bubbleSent.tabId !== tabId) {
        sendToTab(bubbleSent.tabId, { type: 'bg.bubble', bubble: { ...bubbleState(state), visible: false } });
        bubbleSent = null;
    }
    if (tabId === null) return;
    const bubble = bubbleState(state);
    const json = JSON.stringify(bubble);
    if (bubbleSent?.json === json) return;
    bubbleSent = { tabId, json };
    sendToTab(tabId, { type: 'bg.bubble', bubble });
}

function handleHostRequest(reason: SyncRequestReason): void {
    lastRequest = { reason, until: Date.now() + REQUEST_BADGE_MS };
    pushBubble();
    setTimeout(pushBubble, REQUEST_BADGE_MS + 50);
}
function handleClock(offsetMs: number): void {
    if (activeContent?.role === 'viewer') sendToTab(activeContent.tabId, { type: 'bg.clock', clockOffsetMs: offsetMs });
}

/** After an extension update, already-open video tabs have no content script until we inject it. */
async function ensureContentScript(tabId: number): Promise<void> {
    try {
        const [probe] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => (globalThis as { __wppContentAlive?: boolean }).__wppContentAlive === true,
        });
        if (probe?.result) return;
        await chrome.scripting.executeScript({ target: { tabId }, files: ['player-bridge.js'], world: 'MAIN' });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch {
        // Not a YouTube/Netflix page (no host permission) — nothing to inject.
    }
}

function handleContentMessage(message: ContentToBackground, tabId: number): void {
    const state = controller.state();
    const fromMediaTab = shouldAcceptHostEvent(tabId, state.mediaTab?.tabId ?? null);
    switch (message.type) {
        case 'content.hello':
            if (fromMediaTab && activeContent?.tabId === tabId) activateTab(tabId, activeContent.role);
            if (fromMediaTab) {
                bubbleSent = null; // fresh page: resend the bubble
                pushBubble();
            }
            return;
        case 'content.openPanel':
            dismissedBubbleTabs.delete(tabId);
            chrome.sidePanel.open({ tabId }).catch(() => {});
            return;
        case 'content.dismissBubble':
            dismissedBubbleTabs.add(tabId);
            pushBubble();
            return;
        case 'content.hostEvent': {
            if (!fromMediaTab || !state.isHost) return;
            const { capturedAtLocalMs, ...event } = message.event;
            controller.send({
                type: 'sync.host_update',
                payload: { ...event, atServerMs: capturedAtLocalMs + controller.clockOffsetMs() },
            });
            return;
        }
        case 'content.viewerStatus':
            if (!fromMediaTab || state.isHost) return;
            controller.send({ type: 'sync.viewer_status', payload: { rev: message.rev, driftSec: message.driftSec, state: message.state } });
            controller.setMySync(message.state);
            return;
        default:
            return;
    }
}

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
    emit: (state) => {
        broadcast({ type: 'bg.session', state });
        syncContentActivation(state);
        pushBubble();
    },
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
            lastNavigatedKey = null;
            await ensureContentScript(req.tabId);
            await controller.create(req.username, req.tabId, await tabTitle(req.tabId));
            return ok();
        case 'session.join':
            lastNavigatedKey = null;
            await ensureContentScript(req.tabId);
            await controller.join(req.roomId, req.username, req.tabId, await tabTitle(req.tabId));
            return ok();
        case 'session.leave':
            lastNavigatedKey = null;
            await controller.leave();
            return ok();
        case 'session.useTab': {
            await ensureContentScript(req.tabId);
            await controller.useTab(req.tabId, await tabTitle(req.tabId));
            const timeline = controller.latestTimeline();
            if (timeline) await followTimeline(timeline, true);
            return ok();
        }
        case 'panel.minimize': {
            const tabId = controller.state().mediaTab?.tabId;
            if (tabId !== undefined) dismissedBubbleTabs.delete(tabId);
            pushBubble(); // The panel closes itself; the port disconnect then shows the bubble.
            return ok();
        }
        case 'sync.resyncMe': {
            const timeline = controller.latestTimeline();
            if (timeline) await followTimeline(timeline, true);
            return ok();
        }
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
    if (typeof sender.tab?.id === 'number' && sender.frameId === 0) {
        const message = parseContentMessage(raw);
        if (message) handleContentMessage(message, sender.tab.id);
    }
    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    dismissedBubbleTabs.delete(tabId);
    if (bubbleSent?.tabId === tabId) bubbleSent = null;
    if (activeContent?.tabId === tabId) activeContent = null;
    if (controller.state().mediaTab?.tabId === tabId) controller.clearMediaTab();
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'wpp-panel') return;
    openPanels += 1;
    controller.setPanelOpen(true);
    pushBubble();
    port.onDisconnect.addListener(() => {
        openPanels = Math.max(0, openPanels - 1);
        if (openPanels === 0) controller.setPanelOpen(false);
        pushBubble();
    });
});

async function bootstrap(): Promise<void> {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    serverUrl = await loadServerUrl(storage);
    await migrateLegacyKeys(storage);
    await controller.restore();
}

void bootstrap();
