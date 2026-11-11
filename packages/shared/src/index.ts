// Legacy v1 exports — removed in Task 23 once the old server/UI code is gone.
export {
    PlatformSchema,
    type Platform,
    SyncProfileSchema as LegacySyncProfileSchema,
    type SyncProfile as LegacySyncProfile,
    UserSchema as LegacyUserSchema,
    type User as LegacyUser,
    RoomSchema as LegacyRoomSchema,
    type Room as LegacyRoom,
    ChatMessageSchema as LegacyChatMessageSchema,
    type ChatMessage as LegacyChatMessage,
    WSMessageSchema,
    type WSMessage,
    generateRandomName as generateLegacyRandomName
} from './schemas';

export * from './media';
export * from './names';
export * from './protocol';
export * from './sync/clock';
