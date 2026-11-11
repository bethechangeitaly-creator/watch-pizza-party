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
    toOffscreen(message: Record<string, unknown>): Promise<void>;
};

export type SetGainResult = { ok: true } | { ok: false; reason: 'needs_icon_click' };

const clampGain = (gain: number) => Math.min(3, Math.max(1, Number.isFinite(gain) ? gain : 1));

export class VolumeBoost {
    capturingTabId: number | null = null;
    private gain = 1;

    constructor(private readonly deps: CaptureDeps, private readonly onGain: (gain: number) => void) {}

    /** Start a capture at the current gain if Chrome allows it right now. Never throws. */
    async arm(tabId: number): Promise<boolean> {
        if (this.capturingTabId === tabId) return true;
        let streamId: string;
        try {
            streamId = await this.deps.getStreamId(tabId);
        } catch {
            return false;
        }
        if (this.capturingTabId !== null) await this.stop();
        await this.deps.ensureOffscreen();
        await this.deps.toOffscreen({ type: 'OFFSCREEN_START_CAPTURE', streamId, gain: this.gain });
        this.capturingTabId = tabId;
        this.onGain(this.gain);
        return true;
    }

    async setGain(tabId: number, gain: number): Promise<SetGainResult> {
        this.gain = clampGain(gain);
        if (this.capturingTabId === tabId) {
            await this.deps.toOffscreen({ type: 'OFFSCREEN_SET_GAIN', gain: this.gain });
            this.onGain(this.gain);
            return { ok: true };
        }
        return (await this.arm(tabId)) ? { ok: true } : { ok: false, reason: 'needs_icon_click' };
    }

    async stop(): Promise<void> {
        const wasCapturing = this.capturingTabId !== null;
        this.capturingTabId = null;
        this.gain = 1;
        this.onGain(1);
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
        await chrome.runtime.sendMessage({ target: 'offscreen', ...message }).catch(() => undefined);
    },
};
