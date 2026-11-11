export type SectionId = 'invite' | 'sync' | 'people' | 'volume';
export type SectionState = Record<SectionId, boolean>;

export const SECTIONS_KEY = 'wpp.sections';
const IDS: SectionId[] = ['invite', 'sync', 'people', 'volume'];

/** Like 1.2: the host starts with Invite open (to share the code); everyone starts with Sync open. */
export function defaultSections(role: 'host' | 'viewer'): SectionState {
    return { invite: role === 'host', sync: true, people: false, volume: false };
}

export function mergeSections(stored: unknown, role: 'host' | 'viewer'): SectionState {
    const result = defaultSections(role);
    if (stored && typeof stored === 'object') {
        for (const id of IDS) {
            const value = (stored as Record<string, unknown>)[id];
            if (typeof value === 'boolean') result[id] = value;
        }
    }
    return result;
}
