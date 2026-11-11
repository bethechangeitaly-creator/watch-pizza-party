import { platformName } from '@watch-party/shared';
import type { PublicSession } from '../lib/messages';

const SITE_SUFFIX = /\s*[-–|]\s*(YouTube|Netflix)\s*$/i;
const SITE_PREFIX = /^Prime Video:\s*/i;

/** What the party is watching: platform name and video title (title from the host, else the tab title). */
export function nowPlaying(session: PublicSession): { platform: string | null; title: string | null } {
    const timeline = session.room?.timeline;
    if (!timeline) return { platform: null, title: null };
    const platform = platformName(timeline.platform);
    const tabTitle = session.mediaTab?.title?.replace(/^\(\d+\)\s*/, '').replace(SITE_SUFFIX, '').replace(SITE_PREFIX, '').trim();
    const title = timeline.title?.trim() || (tabTitle && tabTitle.toLowerCase() !== platform.toLowerCase() ? tabTitle : null);
    return { platform, title };
}
