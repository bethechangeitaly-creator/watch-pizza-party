export type SectionId = 'invite' | 'sync' | 'people' | 'volume';
export type SectionState = Record<SectionId, boolean>;

export const SECTIONS_KEY = 'wpp.sections';
const IDS: SectionId[] = ['invite', 'sync', 'people', 'volume'];

/** Every section starts folded; what the user opens is remembered. */
export function defaultSections(_role: 'host' | 'viewer'): SectionState {
    return { invite: false, sync: false, people: false, volume: false };
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
