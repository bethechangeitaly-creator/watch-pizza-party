import { DEFAULT_SERVER_URL } from '../config';
import type { KeyValueArea } from './sessionStore';

export const SERVER_URL_KEY = 'wpp.serverUrl';

export function normalizeServerUrl(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_SERVER_URL;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error('That is not a valid URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('The server URL must start with http:// or https://');
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.origin}${path}`;
}

export async function loadServerUrl(area: KeyValueArea): Promise<string> {
    try {
        return normalizeServerUrl((await area.get(SERVER_URL_KEY))[SERVER_URL_KEY]);
    } catch {
        return DEFAULT_SERVER_URL;
    }
}
