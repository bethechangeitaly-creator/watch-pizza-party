import { describe, expect, it } from 'vitest';
import { KeyedLimiter, TokenBucket, clientIp, isAllowedOrigin } from '../src/rateLimit';
import { fakeClock } from './helpers';

describe('TokenBucket', () => {
    it('refills over time', () => {
        const clock = fakeClock();
        const b = new TokenBucket(2, 1, clock.now);
        expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
        clock.advance(1000);
        expect(b.take()).toBe(true);
        expect(b.take()).toBe(false);
    });
});

describe('KeyedLimiter', () => {
    it('isolates keys and evicts the oldest', () => {
        const clock = fakeClock();
        const l = new KeyedLimiter(1, 0, clock.now, 2);
        expect([l.take('a'), l.take('a'), l.take('b')]).toEqual([true, false, true]);
        expect(l.take('c')).toBe(true); // evicts 'a'
        expect(l.take('a')).toBe(true);
    });
});

describe('isAllowedOrigin', () => {
    it.each([
        [undefined, true],
        ['chrome-extension://abcdef', true],
        ['http://localhost:5173', true],
        ['http://127.0.0.1:3005', true],
        ['https://evil.com', false],
        ['http://localhost.evil.com', false],
    ])('isAllowedOrigin(%s)', (o, ok) => expect(isAllowedOrigin(o, [])).toBe(ok));

    it('accepts configured extra origins', () => {
        expect(isAllowedOrigin('https://admin.example.com', ['https://admin.example.com'])).toBe(true);
    });
});

describe('clientIp', () => {
    it('behind a trusted proxy, uses the proxy-appended (last) forwarded entry', () => {
        expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, 'x', true)).toBe('1.2.3.4');
        expect(clientIp({}, '9.9.9.9', true)).toBe('9.9.9.9');
    });

    it('without a trusted proxy, ignores the (forgeable) header', () => {
        expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '9.9.9.9', false)).toBe('9.9.9.9');
    });
});
