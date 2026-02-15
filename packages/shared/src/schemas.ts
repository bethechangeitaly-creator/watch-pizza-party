import { z } from 'zod';

export const PlatformSchema = z.enum(['youtube', 'netflix', 'unknown']);
export type Platform = z.infer<typeof PlatformSchema>;
export const SyncProfileSchema = z.enum(['youtube', 'netflix', 'other']);
export type SyncProfile = z.infer<typeof SyncProfileSchema>;

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatarColor: z.string(),
  role: z.enum(['host', 'viewer']),
  joinedAt: z.number(),
});

export type User = z.infer<typeof UserSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  participants: z.array(UserSchema),
  currentUrl: z.string().optional(),
  currentTitle: z.string().optional(),
  currentPlatform: PlatformSchema.default('unknown'),
  syncProfile: SyncProfileSchema.default('other'),
  referenceTimeSeconds: z.number().default(0),
  referenceUpdatedAt: z.number().default(0),
  isPlaying: z.boolean().default(false),
  lastActivity: z.number(),
});

export type Room = z.infer<typeof RoomSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  username: z.string(),
  avatarColor: z.string(),
  text: z.string(),
  timestamp: z.number(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const HostSnapshotPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
  mediaId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  platform: PlatformSchema,
  syncProfile: SyncProfileSchema.default('other'),
  timeSeconds: z.number(),
  isPlaying: z.boolean(),
  playbackRate: z.number().default(1),
  inAd: z.boolean().default(false),
  syncAggression: z.number().min(0).max(100).default(50),
  capturedAt: z.number(),
  username: z.string().optional(),
});

const ViewerPlaybackStateSchema = z.enum(['playing', 'paused', 'buffering', 'ad']);

const ViewerStatusPayloadSchema = z.object({
  appliedSeq: z.number().int().nonnegative(),
  driftSeconds: z.number(),
  blockedByAd: z.boolean(),
  state: ViewerPlaybackStateSchema,
  username: z.string().optional(),
});

const ViewerRequestSyncPayloadSchema = z.object({
  reason: z.string().optional(),
  username: z.string().optional(),
});

const SyncSystemEventKindSchema = z.enum([
  'host.play',
  'host.pause',
  'host.seek',
  'host.media_change',
  'host.sync_forced',
  'viewer.out_of_sync',
  'viewer.request_sync',
  'viewer.ad_finished'
]);

const SyncSystemEventPayloadSchema = z.object({
  kind: SyncSystemEventKindSchema,
  text: z.string(),
  username: z.string().optional(),
  targetUsername: z.string().optional(),
  driftSeconds: z.number().optional(),
  timestamp: z.number(),
});

const MediaStatePayloadSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  platform: PlatformSchema.optional(),
  syncProfile: SyncProfileSchema.optional(),
  timeSeconds: z.number().optional(),
  isPlaying: z.boolean().optional(),
});

const NavigatePayloadSchema = z.object({
  seq: z.number().int().nonnegative().optional(),
  url: z.string(),
  title: z.string().optional(),
  platform: PlatformSchema.optional(),
  syncProfile: SyncProfileSchema.optional(),
  timeSeconds: z.number().optional(),
  isPlaying: z.boolean().optional(),
  username: z.string().optional(),
  at: z.number().optional(),
});

// WebSocket Message Types
export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.join'), payload: z.object({ roomId: z.string(), username: z.string().optional() }) }),
  z.object({ type: z.literal('room.state'), payload: RoomSchema }),
  z.object({ type: z.literal('sync.host_snapshot'), payload: HostSnapshotPayloadSchema }),
  z.object({ type: z.literal('sync.force_snapshot'), payload: HostSnapshotPayloadSchema }),
  z.object({ type: z.literal('sync.viewer_status'), payload: ViewerStatusPayloadSchema }),
  z.object({ type: z.literal('sync.viewer_request_sync'), payload: ViewerRequestSyncPayloadSchema }),
  z.object({ type: z.literal('sync.system_event'), payload: SyncSystemEventPayloadSchema }),
  z.object({ type: z.literal('sync.navigate'), payload: NavigatePayloadSchema }),
  z.object({ type: z.literal('room.update_url'), payload: MediaStatePayloadSchema }),
  z.object({ type: z.literal('chat.send'), payload: z.object({ text: z.string() }) }),
  z.object({ type: z.literal('chat.message'), payload: ChatMessageSchema }),
  z.object({
    type: z.literal('sync.set_reference_time'),
    payload: z.object({
      timeSeconds: z.number(),
      source: z.enum(['seek', 'tick', 'initial']).optional(),
      username: z.string().optional(),
      seq: z.number().int().nonnegative().optional()
    })
  }),
  z.object({
    type: z.literal('sync.play_intent'),
    payload: z.object({
      timeSeconds: z.number(),
      username: z.string().optional(),
      seq: z.number().int().nonnegative().optional()
    })
  }),
  z.object({
    type: z.literal('sync.pause_intent'),
    payload: z.object({
      timeSeconds: z.number(),
      username: z.string().optional(),
      seq: z.number().int().nonnegative().optional()
    })
  }),
  z.object({ type: z.literal('error'), payload: z.object({ message: z.string() }) }),
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

// Helpers
const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Black', 'White', 'Brown', 'Gray', 'Teal'];
const PIZZA_INGREDIENTS = [
  'Pepperoni', 'Mushroom', 'Olive', 'Onion', 'Basil', 'Sausage',
  'Mozzarella', 'Tomato', 'Ham', 'Bacon', 'Jalapeno', 'Pineapple',
  'Anchovy', 'Garlic', 'Capers', 'Truffle', 'Pesto', 'HotHoney',
  'Burrata', 'ChiliFlake'
];
const HEX_COLORS = [
  '#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#F97316', '#A855F7',
  '#EC4899', '#111827', '#E5E7EB', '#92400E', '#6B7280', '#0D9488'
];

export function generateRandomName() {
  const colorIndex = Math.floor(Math.random() * COLORS.length);
  const ingredientIndex = Math.floor(Math.random() * PIZZA_INGREDIENTS.length);

  const colorName = COLORS[colorIndex];
  const ingredientName = PIZZA_INGREDIENTS[ingredientIndex];
  const hexColor = HEX_COLORS[colorIndex];

  return {
    name: `${colorName}_${ingredientName}`,
    color: hexColor
  };
}
