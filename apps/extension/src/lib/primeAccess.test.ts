import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PRIME_OPTIONAL_ORIGINS, primeContentMatches, primeOriginsFor } from './primeAccess';

describe('Prime Video access', () => {
    it('asks only for primevideo.com, plus the Amazon store the tab is on', () => {
        expect(primeOriginsFor(undefined)).toEqual(['https://*.primevideo.com/*']);
        expect(primeOriginsFor('https://www.primevideo.com/detail/0L8YQ591BLZ0VTAHS228HDGRIP')).toEqual(['https://*.primevideo.com/*']);
        expect(primeOriginsFor('https://www.amazon.it/gp/video/detail/B0DFGH1234')).toEqual(['https://*.primevideo.com/*', 'https://*.amazon.it/*']);
    });

    it('runs the content script only on video pages of the granted sites', () => {
        expect(primeContentMatches(['https://*.primevideo.com/*', 'https://*.amazon.it/*', 'https://*.youtube.com/*'])).toEqual([
            'https://*.primevideo.com/*',
            'https://*.amazon.it/gp/video/*',
        ]);
    });

    it('the manifest lists Prime Video only as optional access', () => {
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8'));
        expect(manifest.optional_host_permissions).toEqual(PRIME_OPTIONAL_ORIGINS);
        expect(JSON.stringify(manifest.host_permissions)).not.toMatch(/amazon|primevideo/);
        expect(JSON.stringify(manifest.content_scripts)).not.toMatch(/amazon|primevideo/);
    });
});
