import { describe, expect, it } from 'vitest';
import { sessionWith } from '../test/sessions';
import { nowPlaying } from './nowPlaying';

describe('nowPlaying', () => {
    it('shows the platform and the title from the host', () => {
        expect(nowPlaying(sessionWith({ playing: true }))).toEqual({ platform: 'YouTube', title: 'Song' });
    });

    it('falls back to the video tab title, without the site suffix', () => {
        const s = sessionWith({ playing: true, mediaTab: { tabId: 1, title: 'Big Buck Bunny - YouTube' } });
        s.room!.timeline = { ...s.room!.timeline!, title: undefined };
        expect(nowPlaying(s)).toEqual({ platform: 'YouTube', title: 'Big Buck Bunny' });
    });

    it('says when nothing is playing yet', () => {
        expect(nowPlaying(sessionWith({}))).toEqual({ platform: null, title: null });
    });

    it('names Prime Video and drops its page-title prefix', () => {
        const s = sessionWith({ playing: true, mediaTab: { tabId: 1, title: 'Prime Video: Carrie - Season 1' } });
        s.room!.timeline = { ...s.room!.timeline!, platform: 'prime', mediaId: '0L8YQ591BLZ0VTAHS228HDGRIP', title: undefined };
        expect(nowPlaying(s)).toEqual({ platform: 'Prime Video', title: 'Carrie - Season 1' });
    });
});
