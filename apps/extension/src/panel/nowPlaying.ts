import type { PublicSession } from '../lib/messages';

const SITE_SUFFIX = /\s*[-–|]\s*(YouTube|Netflix)\s*$/i;

/** What the party is watching: platform name and video title (title from the host, else the tab title). */
export function nowPlaying(session: PublicSession): { platform: 'YouTube' | 'Netflix' | null; title: string | null } {
    const timeline = session.room?.timeline;
    if (!timeline) return { platform: null, title: null };
    const platform = timeline.platform === 'youtube' ? 'YouTube' : 'Netflix';
    const tabTitle = session.mediaTab?.title?.replace(/^\(\d+\)\s*/, '').replace(SITE_SUFFIX, '').trim();
    const title = timeline.title?.trim() || (tabTitle && tabTitle.toLowerCase() !== platform.toLowerCase() ? tabTitle : null);
    return { platform, title };
}
