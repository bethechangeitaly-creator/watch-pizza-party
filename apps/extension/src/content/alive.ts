// The flag lives in the extension's isolated world, which outlives an extension update: the old
// (orphaned) content script stays there with a dead chrome.runtime. So the flag is a function that
// asks the script that set it whether its own extension context is still alive.

const KEY = '__wppContentAlive';

export function runtimeAlive(): boolean {
    try {
        return Boolean(chrome.runtime?.id);
    } catch {
        return false;
    }
}

export function markAlive(scope: Record<string, unknown>, alive: () => boolean): void {
    scope[KEY] = alive;
}

export function isAlive(scope: Record<string, unknown>): boolean {
    const check = scope[KEY];
    if (typeof check !== 'function') return false;
    try {
        return Boolean(check());
    } catch {
        return false;
    }
}

/** Passed to chrome.scripting.executeScript, so it must not reference anything outside itself. */
export function probeContentAlive(): boolean {
    const check = (globalThis as Record<string, unknown>).__wppContentAlive;
    if (typeof check !== 'function') return false;
    try {
        return Boolean(check());
    } catch {
        return false;
    }
}
