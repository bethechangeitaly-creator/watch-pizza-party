import { AMAZON_VIDEO_DOMAINS } from '@watch-party/shared';

// Prime Video access is optional: asked for the first time someone hosts or follows on Prime Video,
// so the update never adds a permission warning (which would switch the extension off for everyone).

const PRIMEVIDEO = 'https://*.primevideo.com/*';
const amazonOrigin = (domain: string) => `https://*.${domain}/*`;

/** Every origin the manifest lists as optional (check-dist compares against this). */
export const PRIME_OPTIONAL_ORIGINS = [PRIMEVIDEO, ...AMAZON_VIDEO_DOMAINS.map(amazonOrigin)];

/** What to ask for: primevideo.com (where viewers are sent), plus the Amazon store this tab is on. */
export function primeOriginsFor(tabUrl: string | undefined): string[] {
    let host = '';
    try {
        host = tabUrl ? new URL(tabUrl).hostname.toLowerCase() : '';
    } catch {
        host = '';
    }
    const store = AMAZON_VIDEO_DOMAINS.find((d) => host === d || host === `www.${d}`);
    return store ? [PRIMEVIDEO, amazonOrigin(store)] : [PRIMEVIDEO];
}

/** Content-script matches for granted origins: all of primevideo.com, only /gp/video on Amazon stores. */
export function primeContentMatches(granted: string[]): string[] {
    return granted
        .filter((o) => PRIME_OPTIONAL_ORIGINS.includes(o))
        .map((o) => (o === PRIMEVIDEO ? o : o.replace(/\/\*$/, '/gp/video/*')));
}

/** Must be called straight from a click (Chrome only shows the prompt for a user gesture). */
export function requestPrimeAccess(tabUrl: string | undefined): Promise<boolean> {
    return chrome.permissions.request({ origins: primeOriginsFor(tabUrl) }).catch(() => false);
}

export function hasPrimeAccess(): Promise<boolean> {
    return chrome.permissions.contains({ origins: [PRIMEVIDEO] }).catch(() => false);
}
