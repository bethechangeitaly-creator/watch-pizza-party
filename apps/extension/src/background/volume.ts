// Volume boost: tab audio → offscreen document → gain → limiter → speakers.
//
// Chrome only lets an extension capture a tab's audio right after the user clicks the extension's
// icon on that tab (the "activeTab" grant), and forgets it when the tab loads a new page. So the
// capture is armed at 100% the moment that's allowed (panel opened on the video tab, party started
// or joined there); the slider then only changes the gain. Nothing here ever switches tabs.

export type CaptureDeps = {
    getStreamId(tabId: number): Promise<string>;
    ensureOffscreen(): Promise<void>;
    closeOffscreen(): Promise<void>;
    toOffscreen(message: Record<string, unknown>): Promise<unknown>;
};

export type SetGainResult = { ok: true } | { ok: false; reason: 'needs_icon_click' };

const clampGain = (gain: number) => Math.min(3, Math.max(1, Number.isFinite(gain) ? gain : 1));

type OffscreenReply = { ok?: boolean; capturing?: boolean; tabId?: number | null } | undefined;

export class VolumeBoost {
    capturingTabId: number | null = null;
    private gain = 1;

    /** onState(gain, readyTabId): readyTabId is the tab whose audio is being boosted, or null. */
    constructor(private readonly deps: CaptureDeps, private readonly onState: (gain: number, readyTabId: number | null) => void) {}

    private report(): void {
        this.onState(this.gain, this.capturingTabId);
    }

    /** A capture can outlive the service worker; adopt it instead of asking for a new click. */
    private async adopt(tabId: number): Promise<boolean> {
        const reply = (await this.deps.toOffscreen({ type: 'OFFSCREEN_PING' }).catch(() => undefined)) as OffscreenReply;
        if (reply?.capturing && reply.tabId === tabId) {
            this.capturingTabId = tabId;
            return true;
        }
        return false;
    }

    /** Start a capture at the current gain if Chrome allows it right now. Never throws. */
    async arm(tabId: number): Promise<boolean> {
        if (this.capturingTabId === tabId) return true;
        if (await this.adopt(tabId)) {
            await this.deps.toOffscreen({ type: 'OFFSCREEN_SET_GAIN', gain: this.gain });
            this.report();
            return true;
        }
        let streamId: string;
        try {
            streamId = await this.deps.getStreamId(tabId);
        } catch {
            return false;
        }
        if (this.capturingTabId !== null) await this.stop();
        try {
            await this.deps.ensureOffscreen();
            const reply = (await this.deps.toOffscreen({ type: 'OFFSCREEN_START_CAPTURE', streamId, tabId, gain: this.gain })) as OffscreenReply;
            if (!reply?.ok) throw new Error('capture did not start');
        } catch {
            await this.deps.closeOffscreen().catch(() => {});
            this.report();
            return false;
        }
        this.capturingTabId = tabId;
        this.report();
        return true;
    }

    async setGain(tabId: number, gain: number): Promise<SetGainResult> {
        this.gain = clampGain(gain);
        if (this.capturingTabId !== tabId) await this.adopt(tabId);
        if (this.capturingTabId === tabId) {
            await this.deps.toOffscreen({ type: 'OFFSCREEN_SET_GAIN', gain: this.gain });
            this.report();
            return { ok: true };
        }
        return (await this.arm(tabId)) ? { ok: true } : { ok: false, reason: 'needs_icon_click' };
    }

    async stop(): Promise<void> {
        const wasCapturing = this.capturingTabId !== null;
        this.capturingTabId = null;
        this.gain = 1;
        this.report();
        if (!wasCapturing) return;
        await this.deps.toOffscreen({ type: 'OFFSCREEN_STOP_CAPTURE' });
        await this.deps.closeOffscreen().catch(() => {});
    }
}

const OFFSCREEN_URL = 'offscreen.html';
const offscreenContexts = () =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });

export const chromeCaptureDeps: CaptureDeps = {
    getStreamId: (tabId) =>
        new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
                const error = chrome.runtime.lastError;
                if (error || !streamId) reject(new Error(error?.message ?? 'no stream id'));
                else resolve(streamId);
            });
        }),
    ensureOffscreen: async () => {
        if ((await offscreenContexts()).length > 0) return;
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Volume boost: amplify the party tab audio.',
        });
    },
    closeOffscreen: async () => {
        if ((await offscreenContexts()).length > 0) await chrome.offscreen.closeDocument();
    },
    toOffscreen: async (message) => {
        if (message.type === 'OFFSCREEN_PING' && (await offscreenContexts()).length === 0) return undefined;
        return chrome.runtime.sendMessage({ target: 'offscreen', ...message }).catch(() => undefined);
    },
};
