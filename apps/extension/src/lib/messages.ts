import { z } from 'zod';
import {
    HostUpdateCauseSchema,
    SupportedPlatformSchema,
    ViewerSyncStateSchema,
    isValidMediaRef,
    type ChatMessage,
    type HostUpdateCause,
    type Room,
    type SupportedPlatform,
    type SyncRequestReason,
    type SystemEvent,
    type Timeline,
    type ViewerSyncState,
} from '@watch-party/shared';

// ── Panel ⇄ background ────────────────────────────────────────────────────────

export type PublicSession = {
    status: 'idle' | 'connecting' | 'waking' | 'joined' | 'reconnecting' | 'error';
    roomId: string | null;
    me: { userId: string; username: string; avatarColor: string } | null;
    isHost: boolean;
    room: Room | null;
    mediaTab: { tabId: number; title: string } | null;
    mySync: ViewerSyncState | null;
    serverUrl: string;
    error: { code?: string; message: string } | null;
    volumeGain: number;
    /** Volume boost is capturing the party's video tab, so the slider works without another click. */
    volumeReady: boolean;
    /** Viewer: the video needs one click (Chrome blocked playback, or Prime Video must show its time). */
    needsVideoClick: boolean;
    unread: number;
};

export type PanelRequest =
    | { type: 'session.get' }
    | { type: 'session.create'; username: string; tabId: number }
    | { type: 'session.join'; roomId: string; username: string; tabId: number }
    | { type: 'session.leave' }
    | { type: 'session.useTab'; tabId: number }
    | { type: 'chat.send'; text: string }
    | { type: 'sync.force' }
    | { type: 'sync.request'; reason: SyncRequestReason }
    | { type: 'sync.resyncMe' }
    | { type: 'server.setUrl'; url: string }
    | { type: 'panel.minimize' }
    | { type: 'volume.set'; gain: number }
    | { type: 'volume.arm'; tabId: number }
    | { type: 'volume.stop' };

export type PanelResponse = { ok: true; state: PublicSession } | { ok: false; error: string; code?: string };

export type TimelineEntry = { kind: 'chat'; message: ChatMessage } | { kind: 'system'; event: SystemEvent };

export type BackgroundEvent =
    | { type: 'bg.session'; state: PublicSession }
    | { type: 'bg.entries'; entries: TimelineEntry[] };

// ── Content ⇄ background ──────────────────────────────────────────────────────

export type HostPlayerEvent = {
    platform: SupportedPlatform;
    mediaId: string;
    title?: string;
    positionSec: number;
    capturedAtLocalMs: number;
    rate: number;
    paused: boolean;
    inAd: boolean;
    cause: HostUpdateCause;
};

export type BubbleState = {
    visible: boolean;
    participants: number;
    unread: number;
    connected: boolean;
    request: SyncRequestReason | null;
};

export type ContentToBackground =
    | { type: 'content.hello'; url: string }
    | { type: 'content.hostEvent'; event: HostPlayerEvent }
    | { type: 'content.viewerStatus'; rev: number; driftSec: number; state: ViewerSyncState; needsClick?: boolean }
    | { type: 'content.needsClick'; value: boolean }
    | { type: 'content.openPanel' }
    | { type: 'content.dismissBubble' };

export type BackgroundToContent =
    | { type: 'bg.activate'; role: 'host' | 'viewer' }
    | { type: 'bg.deactivate' }
    | { type: 'bg.timeline'; timeline: Timeline; clockOffsetMs: number; force: boolean }
    | { type: 'bg.clock'; clockOffsetMs: number }
    | { type: 'bg.bubble'; bubble: BubbleState };

const HostPlayerEventSchema = z
    .object({
        platform: SupportedPlatformSchema,
        mediaId: z.string().max(32),
        title: z.string().max(300).optional(),
        positionSec: z.number().finite().nonnegative(),
        capturedAtLocalMs: z.number().finite(),
        rate: z.number().min(0.25).max(4),
        paused: z.boolean(),
        inAd: z.boolean(),
        cause: HostUpdateCauseSchema,
    })
    .refine(isValidMediaRef);

export const ContentToBackgroundSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('content.hello'), url: z.string().max(4096) }),
    z.object({ type: z.literal('content.hostEvent'), event: HostPlayerEventSchema }),
    z.object({
        type: z.literal('content.viewerStatus'),
        rev: z.number().int().nonnegative(),
        driftSec: z.number().finite(),
        state: ViewerSyncStateSchema,
        needsClick: z.boolean().optional(),
    }),
    z.object({ type: z.literal('content.needsClick'), value: z.boolean() }),
    z.object({ type: z.literal('content.openPanel') }),
    z.object({ type: z.literal('content.dismissBubble') }),
]);

export function parseContentMessage(raw: unknown): ContentToBackground | null {
    const parsed = ContentToBackgroundSchema.safeParse(raw);
    return parsed.success ? (parsed.data as ContentToBackground) : null;
}
