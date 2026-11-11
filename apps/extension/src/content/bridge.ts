// Synchronous request/response with the MAIN-world player-bridge.js (loaded by the manifest).
// dispatchEvent runs listeners synchronously, so the response arrives before dispatchEvent returns.

const NAMESPACE = 'watchpizzaparty-bridge-v1';
const REQUEST_EVENT = 'watchpizzaparty:bridge:request';
const RESPONSE_EVENT = 'watchpizzaparty:bridge:response';

export type BridgeCommand =
    | 'youtube.play' | 'youtube.pause' | 'youtube.seek' | 'youtube.rate'
    | 'netflix.state' | 'netflix.play' | 'netflix.pause' | 'netflix.seek'
    | 'prime.state' | 'prime.seek';

type BridgeResponse = { namespace?: string; direction?: string; id?: number; handled?: boolean; payload?: Record<string, unknown> | null };

let seq = 0;
let waitingFor = 0;
let response: BridgeResponse | null = null;
let listening = false;

function listen(): void {
    if (listening) return;
    listening = true;
    window.addEventListener(RESPONSE_EVENT, (event) => {
        const detail = (event as CustomEvent<BridgeResponse>).detail;
        if (detail?.namespace === NAMESPACE && detail.direction === 'to-content' && detail.id === waitingFor) response = detail;
    });
}

export function callBridge(
    command: BridgeCommand,
    payload?: Record<string, unknown>,
): { handled: boolean; payload?: Record<string, unknown> } | null {
    listen();
    seq += 1;
    waitingFor = seq;
    response = null;
    window.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
        detail: { namespace: NAMESPACE, direction: 'to-page', id: seq, command, payload: payload ?? null },
    }));
    const result = response as BridgeResponse | null;
    waitingFor = 0;
    response = null;
    return result ? { handled: Boolean(result.handled), ...(result.payload ? { payload: result.payload } : {}) } : null;
}
