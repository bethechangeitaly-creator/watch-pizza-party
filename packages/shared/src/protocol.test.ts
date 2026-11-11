import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, HostUpdateSchema, ServerMessageSchema, TimelineSchema, UPDATE_REQUIRED_MESSAGE } from './protocol';

const hostUpdate = {
    platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 1, atServerMs: 1,
    rate: 1, paused: false, inAd: false, cause: 'play',
};

describe('ClientMessageSchema', () => {
    it('rejects join without protocolVersion 2', () => {
        expect(ClientMessageSchema.safeParse({ type: 'room.join', payload: { roomId: 'abc' } }).success).toBe(false);
        expect(ClientMessageSchema.safeParse({ type: 'room.join', payload: { roomId: 'abc', protocolVersion: 1 } }).success).toBe(false);
        expect(ClientMessageSchema.safeParse({ type: 'room.join', payload: { roomId: 'abc', protocolVersion: 2 } }).success).toBe(true);
    });

    it('caps chat length and trims', () => {
        expect(ClientMessageSchema.safeParse({ type: 'chat.send', payload: { text: 'a'.repeat(501) } }).success).toBe(false);
        expect(ClientMessageSchema.safeParse({ type: 'chat.send', payload: { text: '   ' } }).success).toBe(false);
        const parsed = ClientMessageSchema.parse({ type: 'chat.send', payload: { text: '  hi  ' } });
        expect(parsed).toEqual({ type: 'chat.send', payload: { text: 'hi' } });
    });

    it('rejects unknown message types', () => {
        expect(ClientMessageSchema.safeParse({ type: 'sync.host_snapshot', payload: {} }).success).toBe(false);
    });
});

describe('HostUpdateSchema', () => {
    it('has no url/seq fields and validates media ids', () => {
        expect(HostUpdateSchema.safeParse(hostUpdate).success).toBe(true);
        expect(HostUpdateSchema.safeParse({ ...hostUpdate, mediaId: '../../x' }).success).toBe(false);
        const parsed = HostUpdateSchema.parse({ ...hostUpdate, url: 'https://evil.com', seq: 9 });
        expect(parsed).not.toHaveProperty('url');
        expect(parsed).not.toHaveProperty('seq');
    });

    it('rejects rate outside [0.25, 4] and negative positions', () => {
        expect(HostUpdateSchema.safeParse({ ...hostUpdate, rate: 0 }).success).toBe(false);
        expect(HostUpdateSchema.safeParse({ ...hostUpdate, rate: 10 }).success).toBe(false);
        expect(HostUpdateSchema.safeParse({ ...hostUpdate, positionSec: -1 }).success).toBe(false);
    });

    it('caps the title', () => {
        expect(HostUpdateSchema.safeParse({ ...hostUpdate, title: 't'.repeat(301) }).success).toBe(false);
    });
});

describe('TimelineSchema', () => {
    it('validates media refs', () => {
        const timeline = { ...hostUpdate, rev: 1, anchorServerMs: 5, cause: 'force' };
        delete (timeline as Record<string, unknown>).atServerMs;
        expect(TimelineSchema.safeParse(timeline).success).toBe(true);
        expect(TimelineSchema.safeParse({ ...timeline, platform: 'netflix' }).success).toBe(false);
    });
});

describe('ServerMessageSchema', () => {
    it('parses an error with a code', () => {
        const msg = { type: 'error', payload: { code: 'update_required', message: UPDATE_REQUIRED_MESSAGE } };
        expect(ServerMessageSchema.parse(msg)).toEqual(msg);
        expect(ServerMessageSchema.safeParse({ type: 'error', payload: { code: 'nope', message: 'x' } }).success).toBe(false);
    });
});
