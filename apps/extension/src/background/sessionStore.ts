import { z } from 'zod';

export type PersistedSession = { roomId: string; token: string; username: string; mediaTabId: number | null; savedAt: number };

/** The slice of chrome.storage.StorageArea we use; also easy to fake in tests. */
export type KeyValueArea = {
    get(key: string | string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
};

export const SESSION_MAX_AGE_MS = 8 * 3_600_000;

export const LEGACY_KEYS = [
    'watchparty_active_session',
    'watchparty_active_session_regular',
    'watchparty_active_session_incognito',
    'roomId',
    'watchparty_volume_boost',
];

const PersistedSessionSchema = z.object({
    roomId: z.string().min(1).max(32),
    token: z.string().min(1).max(64),
    username: z.string().min(1).max(64),
    mediaTabId: z.number().int().nullable(),
    savedAt: z.number().finite(),
});

export function sessionKey(incognito: boolean): string {
    return `wpp.session.v2.${incognito ? 'incognito' : 'regular'}`;
}

export async function loadSession(area: KeyValueArea, key: string, now: number): Promise<PersistedSession | null> {
    const stored = (await area.get(key))[key];
    const parsed = PersistedSessionSchema.safeParse(stored);
    if (!parsed.success) return null;
    if (now - parsed.data.savedAt > SESSION_MAX_AGE_MS) {
        await area.remove(key);
        return null;
    }
    return parsed.data;
}

export async function saveSession(area: KeyValueArea, key: string, session: PersistedSession): Promise<void> {
    await area.set({ [key]: session });
}

export async function clearSession(area: KeyValueArea, key: string): Promise<void> {
    await area.remove(key);
}

export async function migrateLegacyKeys(area: KeyValueArea): Promise<void> {
    await area.remove(LEGACY_KEYS);
}
