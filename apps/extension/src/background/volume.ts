const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Volume boost: amplify the party tab audio the user asked to boost.',
    });
}

async function closeOffscreen(): Promise<void> {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
    if (contexts.length > 0) await chrome.offscreen.closeDocument();
}

function toOffscreen(message: Record<string, unknown>): Promise<unknown> {
    return chrome.runtime.sendMessage({ target: 'offscreen', ...message }).catch(() => undefined);
}

const clampGain = (gain: number) => Math.min(3, Math.max(1, Number.isFinite(gain) ? gain : 1));

/** Tab-audio gain via tabCapture + an offscreen document. Only started by an explicit user request. */
export class VolumeBoost {
    capturingTabId: number | null = null;

    constructor(private readonly onGain: (gain: number) => void) {}

    async start(tabId: number, streamId: string, gain: number): Promise<void> {
        await this.stop();
        await ensureOffscreen();
        await toOffscreen({ type: 'OFFSCREEN_START_CAPTURE', streamId, gain: clampGain(gain) });
        this.capturingTabId = tabId;
        this.onGain(clampGain(gain));
    }

    async setGain(gain: number): Promise<void> {
        if (this.capturingTabId === null) return;
        await toOffscreen({ type: 'OFFSCREEN_SET_GAIN', gain: clampGain(gain) });
        this.onGain(clampGain(gain));
    }

    async stop(): Promise<void> {
        const wasCapturing = this.capturingTabId !== null;
        this.capturingTabId = null;
        this.onGain(1);
        if (!wasCapturing) return;
        await toOffscreen({ type: 'OFFSCREEN_STOP_CAPTURE' });
        await closeOffscreen().catch(() => {});
    }
}
