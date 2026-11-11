export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'wpp.theme';

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark' {
    if (pref === 'system') return prefersDark ? 'dark' : 'light';
    return pref;
}

let mediaQuery: MediaQueryList | null = null;
let currentPref: ThemePref = 'system';

function paint(): void {
    const prefersDark = mediaQuery?.matches ?? true;
    document.documentElement.dataset.theme = resolveTheme(currentPref, prefersDark);
}

/** Applies a theme preference and keeps following the OS when it is 'system'. */
export function applyTheme(pref: ThemePref): void {
    currentPref = pref;
    if (!mediaQuery) {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', paint);
    }
    paint();
}

export async function loadThemePref(): Promise<ThemePref> {
    const stored = (await chrome.storage.local.get(THEME_KEY))[THEME_KEY];
    return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export async function saveThemePref(pref: ThemePref): Promise<void> {
    await chrome.storage.local.set({ [THEME_KEY]: pref });
}
