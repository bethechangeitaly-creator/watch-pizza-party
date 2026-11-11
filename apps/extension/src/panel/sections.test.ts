import { describe, expect, it } from 'vitest';
import { defaultSections, mergeSections } from './sections';

describe('sections', () => {
    it('defaults per role', () => {
        expect(defaultSections('host')).toEqual({ invite: false, sync: false, people: false, volume: false });
        expect(defaultSections('viewer')).toEqual({ invite: false, sync: false, people: false, volume: false });
    });

    it('stored choices win, junk is ignored', () => {
        expect(mergeSections({ people: true, volume: 'yes', x: 1 }, 'viewer')).toEqual({ invite: false, sync: false, people: true, volume: false });
        expect(mergeSections(null, 'host')).toEqual(defaultSections('host'));
    });
});
