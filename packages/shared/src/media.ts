export type SupportedPlatform = 'youtube' | 'netflix';
export type MediaRef = { platform: SupportedPlatform; mediaId: string };

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const NETFLIX_ID_RE = /^\d{1,12}$/;

function parseHttpsUrl(raw: string): URL | null {
    if (typeof raw !== 'string' || !raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

function isHostOrSubdomain(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Any YouTube or Netflix page (the sites the extension runs on), video or not. */
export function isSupportedSite(rawUrl: string | undefined): boolean {
    const url = rawUrl ? parseHttpsUrl(rawUrl) : null;
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    return isHostOrSubdomain(host, 'youtube.com') || host === 'youtu.be' || isHostOrSubdomain(host, 'netflix.com');
}

export function isValidMediaRef(ref: MediaRef): boolean {
    if (!ref || typeof ref.mediaId !== 'string') return false;
    if (ref.platform === 'youtube') return YOUTUBE_ID_RE.test(ref.mediaId);
    if (ref.platform === 'netflix') return NETFLIX_ID_RE.test(ref.mediaId);
    return false;
}

/** Returns the video a watch page shows, or null for any non-video page. */
export function extractMedia(rawUrl: string): MediaRef | null {
    const url = parseHttpsUrl(rawUrl);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    let ref: MediaRef | null = null;

    if (isHostOrSubdomain(host, 'youtube.com') && url.pathname === '/watch') {
        ref = { platform: 'youtube', mediaId: url.searchParams.get('v') ?? '' };
    } else if (host === 'youtu.be') {
        ref = { platform: 'youtube', mediaId: url.pathname.slice(1) };
    } else if (isHostOrSubdomain(host, 'netflix.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'watch' && parts.length === 2) {
            ref = { platform: 'netflix', mediaId: parts[1] };
        }
    }

    return ref && isValidMediaRef(ref) ? ref : null;
}

/** The only URL a viewer is ever navigated to: built from a validated id, never from host input. */
export function canonicalWatchUrl(ref: MediaRef): string {
    if (!isValidMediaRef(ref)) throw new Error('invalid media ref');
    return ref.platform === 'youtube'
        ? `https://www.youtube.com/watch?v=${ref.mediaId}`
        : `https://www.netflix.com/watch/${ref.mediaId}`;
}

export function isAllowedGifUrl(rawUrl: string): boolean {
    const url = parseHttpsUrl(rawUrl);
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    return host === 'i.giphy.com' || /^media\d*\.giphy\.com$/.test(host);
}
