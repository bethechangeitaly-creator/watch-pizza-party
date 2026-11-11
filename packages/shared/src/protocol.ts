import { z } from 'zod';
import { isValidMediaRef } from './media';

export const PROTOCOL_VERSION = 2;
export const UPDATE_REQUIRED_MESSAGE =
    'Watch Pizza Party was updated. Update the extension (chrome://extensions → Update) and try again.';
export const TIME_EVENT = 'time';
export const MESSAGE_EVENT = 'message';

export const LIMITS = {
    chatMax: 500,
    usernameMax: 32,
    titleMax: 300,
    roomIdMax: 32,
    tokenMax: 64,
    maxParticipants: 20,
    historySize: 100,
} as const;

const mediaRefCheck = (value: { platform: 'youtube' | 'netflix'; mediaId: string }) => isValidMediaRef(value);
const MEDIA_ERROR = { message: 'invalid media id' };

export const SupportedPlatformSchema = z.enum(['youtube', 'netflix']);
export const ViewerSyncStateSchema = z.enum(['synced', 'drifting', 'buffering', 'ad', 'paused']);
export type ViewerSyncState = z.infer<typeof ViewerSyncStateSchema>;
export const UserStatusSchema = z.enum(['synced', 'drifting', 'buffering', 'ad', 'paused', 'reconnecting', 'unknown']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
    id: z.string(),
    username: z.string(),
    avatarColor: z.string(),
    role: z.enum(['host', 'viewer']),
    joinedAt: z.number(),
    status: UserStatusSchema,
});
export type User = z.infer<typeof UserSchema>;

export const HostUpdateCauseSchema = z.enum(['initial', 'media', 'play', 'pause', 'seek', 'rate', 'ad', 'heartbeat']);
export type HostUpdateCause = z.infer<typeof HostUpdateCauseSchema>;
export const TimelineCauseSchema = z.enum([...HostUpdateCauseSchema.options, 'force']);
export type TimelineCause = z.infer<typeof TimelineCauseSchema>;

const playbackFields = {
    platform: SupportedPlatformSchema,
    mediaId: z.string().max(32),
    title: z.string().max(LIMITS.titleMax).optional(),
    positionSec: z.number().finite().nonnegative(),
    rate: z.number().min(0.25).max(4),
    paused: z.boolean(),
    inAd: z.boolean(),
};

export const TimelineSchema = z
    .object({
        rev: z.number().int().nonnegative(),
        ...playbackFields,
        anchorServerMs: z.number().finite(),
        cause: TimelineCauseSchema,
        updatedBy: z.string().optional(),
    })
    .refine(mediaRefCheck, MEDIA_ERROR);
export type Timeline = z.infer<typeof TimelineSchema>;

export const HostUpdateSchema = z
    .object({
        ...playbackFields,
        atServerMs: z.number().finite(),
        cause: HostUpdateCauseSchema,
    })
    .refine(mediaRefCheck, MEDIA_ERROR);
export type HostUpdate = z.infer<typeof HostUpdateSchema>;

export const RoomSchema = z.object({
    id: z.string(),
    hostId: z.string(),
    participants: z.array(UserSchema),
    timeline: TimelineSchema.nullable(),
});
export type Room = z.infer<typeof RoomSchema>;

export const ChatMessageSchema = z.object({
    id: z.string(),
    userId: z.string(),
    username: z.string(),
    avatarColor: z.string(),
    text: z.string().min(1).max(LIMITS.chatMax),
    timestamp: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SystemEventKindSchema = z.enum(['join', 'leave', 'host_change', 'play', 'pause', 'seek', 'media', 'request', 'force']);
export const SystemEventSchema = z.object({
    kind: SystemEventKindSchema,
    text: z.string(),
    userId: z.string().optional(),
    username: z.string().optional(),
    timestamp: z.number(),
});
export type SystemEvent = z.infer<typeof SystemEventSchema>;

export const SyncRequestReasonSchema = z.enum(['resync', 'pause', 'play', 'back', 'forward']);
export type SyncRequestReason = z.infer<typeof SyncRequestReasonSchema>;

export const ErrorCodeSchema = z.enum(['update_required', 'room_not_found', 'room_full', 'rate_limited', 'invalid_message', 'not_host']);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const msg = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
    z.object({ type: z.literal(type), payload });

export const ClientMessageSchema = z.discriminatedUnion('type', [
    msg('room.join', z.object({
        roomId: z.string().min(1).max(LIMITS.roomIdMax),
        token: z.string().max(LIMITS.tokenMax).optional(),
        username: z.string().max(64).optional(),
        protocolVersion: z.literal(PROTOCOL_VERSION),
    })),
    msg('room.leave', z.object({})),
    msg('chat.send', z.object({ text: z.string().trim().min(1).max(LIMITS.chatMax) })),
    msg('sync.host_update', HostUpdateSchema),
    msg('sync.viewer_status', z.object({
        rev: z.number().int().nonnegative(),
        driftSec: z.number().finite(),
        state: ViewerSyncStateSchema,
    })),
    msg('sync.request', z.object({ reason: SyncRequestReasonSchema })),
    msg('sync.force', z.object({})),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
    msg('room.joined', z.object({
        roomId: z.string(),
        userId: z.string(),
        token: z.string(),
        username: z.string(),
        avatarColor: z.string(),
        resumed: z.boolean(),
    })),
    msg('room.state', RoomSchema),
    msg('chat.message', ChatMessageSchema),
    msg('chat.history', z.object({ messages: z.array(ChatMessageSchema) })),
    msg('sync.timeline', TimelineSchema),
    msg('sync.request', z.object({ reason: SyncRequestReasonSchema, userId: z.string(), username: z.string() })),
    msg('system.event', SystemEventSchema),
    msg('error', z.object({ code: ErrorCodeSchema, message: z.string() })),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const CreateRoomRequestSchema = z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    username: z.string().max(64).optional(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const CreateRoomResponseSchema = z.object({
    roomId: z.string(),
    userId: z.string(),
    token: z.string(),
    username: z.string(),
    avatarColor: z.string(),
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
