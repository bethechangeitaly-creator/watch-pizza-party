import type { KeyValueArea } from '../background/sessionStore';

/** In-memory stand-in for chrome.storage.* areas. */
export function memoryArea(): KeyValueArea & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>();
    return {
        data,
        async get(key) {
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
        },
        async set(items) {
            for (const [k, v] of Object.entries(items)) data.set(k, v);
        },
        async remove(keys) {
            for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
        },
    };
}
