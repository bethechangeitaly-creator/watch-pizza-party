export type ThemePref = 'light' | 'dark';
export const THEME_KEY = 'wpp.theme';

/** Night is the default: the panel sits next to a film. */
export function parseThemePref(value: unknown): ThemePref {
    return value === 'light' ? 'light' : 'dark';
}

export function applyTheme(pref: ThemePref): void {
    document.documentElement.dataset.theme = pref;
}

export async function loadThemePref(): Promise<ThemePref> {
    return parseThemePref((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
}

export async function saveThemePref(pref: ThemePref): Promise<void> {
    await chrome.storage.local.set({ [THEME_KEY]: pref });
}
