export type SupportedPlatform = 'youtube' | 'netflix' | 'prime';
export type MediaRef = { platform: SupportedPlatform; mediaId: string };

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const NETFLIX_ID_RE = /^\d{1,12}$/;
/** Prime Video title ids: 10-character ASINs (B0…) or 26-character ids (0L8Y…). */
const PRIME_ID_RE = /^(?:[A-Z0-9]{10}|[A-Z0-9]{26})$/;

/** Amazon stores whose /gp/video pages play Prime Video. */
export const AMAZON_VIDEO_DOMAINS = [
    'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.it', 'amazon.fr', 'amazon.es', 'amazon.ca', 'amazon.co.jp',
    'amazon.com.au', 'amazon.in', 'amazon.com.br', 'amazon.com.mx', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.com.be',
] as const;

const NAMES: Record<SupportedPlatform, string> = { youtube: 'YouTube', netflix: 'Netflix', prime: 'Prime Video' };
export const platformName = (platform: SupportedPlatform): string => NAMES[platform];

/** A Prime Video page: primevideo.com or an Amazon store's /gp/video pages. */
export function isPrimeVideoSite(rawUrl: string | undefined): boolean {
    const url = rawUrl ? parseHttpsUrl(rawUrl) : null;
    return !!url && isPrimeSite(url);
}

function isPrimeSite(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (isHostOrSubdomain(host, 'primevideo.com')) return true;
    return AMAZON_VIDEO_DOMAINS.some((d) => host === d || host === `www.${d}`) && url.pathname.startsWith('/gp/video');
}

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

/** Any YouTube, Netflix or Prime Video page (the sites the extension runs on), video or not. */
export function isSupportedSite(rawUrl: string | undefined): boolean {
    const url = rawUrl ? parseHttpsUrl(rawUrl) : null;
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    return isHostOrSubdomain(host, 'youtube.com') || host === 'youtu.be' || isHostOrSubdomain(host, 'netflix.com') || isPrimeSite(url);
}

export function isValidMediaRef(ref: MediaRef): boolean {
    if (!ref || typeof ref.mediaId !== 'string') return false;
    if (ref.platform === 'youtube') return YOUTUBE_ID_RE.test(ref.mediaId);
    if (ref.platform === 'netflix') return NETFLIX_ID_RE.test(ref.mediaId);
    if (ref.platform === 'prime') return PRIME_ID_RE.test(ref.mediaId);
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
    } else if (isPrimeSite(url)) {
        // …/detail/<id>, …/detail/<slug>/<id>, /-/it/detail/<id>, /region/eu/detail/<id>, /gp/video/detail/<id>
        const parts = url.pathname.split('/').filter(Boolean);
        const at = parts.indexOf('detail');
        const id = at >= 0 ? [parts[at + 1], parts[at + 2]].find((p) => p && PRIME_ID_RE.test(p)) : undefined;
        if (id) ref = { platform: 'prime', mediaId: id };
    }

    return ref && isValidMediaRef(ref) ? ref : null;
}

/** The only URL a viewer is ever navigated to: built from a validated id, never from host input. */
export function canonicalWatchUrl(ref: MediaRef): string {
    if (!isValidMediaRef(ref)) throw new Error('invalid media ref');
    if (ref.platform === 'youtube') return `https://www.youtube.com/watch?v=${ref.mediaId}`;
    if (ref.platform === 'netflix') return `https://www.netflix.com/watch/${ref.mediaId}`;
    return `https://www.primevideo.com/detail/${ref.mediaId}?autoplay=1&t=0`;
}

export function isAllowedGifUrl(rawUrl: string): boolean {
    const url = parseHttpsUrl(rawUrl);
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    return host === 'i.giphy.com' || /^media\d*\.giphy\.com$/.test(host);
}
