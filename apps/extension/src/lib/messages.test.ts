import { describe, expect, it } from 'vitest';
import { parseContentMessage } from './messages';

describe('parseContentMessage', () => {
    it('accepts valid content messages', () => {
        expect(parseContentMessage({ type: 'content.viewerStatus', rev: 1, driftSec: 0.1, state: 'synced' })).not.toBeNull();
        expect(parseContentMessage({ type: 'content.hello', url: 'https://www.youtube.com/' })).not.toBeNull();
        expect(parseContentMessage({
            type: 'content.hostEvent',
            event: { platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 3, capturedAtLocalMs: 1, rate: 1, paused: false, inAd: false, cause: 'play' },
        })).not.toBeNull();
    });

    it('rejects junk', () => {
        expect(parseContentMessage({ type: 'content.hostEvent', event: { platform: 'youtube', mediaId: '../x' } })).toBeNull();
        expect(parseContentMessage({ type: 'WATCHPARTY_PING' })).toBeNull();
        expect(parseContentMessage(null)).toBeNull();
    });
});
