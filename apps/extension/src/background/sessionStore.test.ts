import { describe, expect, it } from 'vitest';
import {
    LEGACY_KEYS, SESSION_MAX_AGE_MS, clearSession, loadSession, migrateLegacyKeys, saveSession, sessionKey,
    type KeyValueArea, type PersistedSession,
} from './sessionStore';

export function memoryArea(): KeyValueArea & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>();
    return {
        data,
        async get(key) {
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
        },
        async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, v); },
        async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k); },
    };
}

const k = sessionKey(false);
const s: PersistedSession = { roomId: 'Jol4I72BE4', token: 'T'.repeat(24), username: 'Luca', mediaTabId: 7, savedAt: 1000 };

describe('sessionStore', () => {
    it('round-trips', async () => {
        const a = memoryArea();
        await saveSession(a, k, s);
        expect(await loadSession(a, k, 2000)).toEqual(s);
    });

    it('expires after 8h and clears the key', async () => {
        const a = memoryArea();
        await saveSession(a, k, { ...s, savedAt: 0 });
        expect(await loadSession(a, k, SESSION_MAX_AGE_MS + 1)).toBeNull();
        expect(await a.get(k)).toEqual({});
    });

    it('rejects malformed data', async () => {
        const a = memoryArea();
        await a.set({ [k]: { roomId: 5 } });
        expect(await loadSession(a, k, 0)).toBeNull();
    });

    it('clears', async () => {
        const a = memoryArea();
        await saveSession(a, k, s);
        await clearSession(a, k);
        expect(await loadSession(a, k, 2000)).toBeNull();
    });

    it('uses separate keys for incognito', () => expect(sessionKey(true)).not.toBe(sessionKey(false)));

    it('removes legacy keys', async () => {
        const a = memoryArea();
        await a.set(Object.fromEntries(LEGACY_KEYS.map((key) => [key, 'x'])));
        await migrateLegacyKeys(a);
        expect(a.data.size).toBe(0);
    });
});
