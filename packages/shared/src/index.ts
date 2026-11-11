// Legacy v1 exports — removed in Task 23 once the old UI is gone.
export {
    PlatformSchema,
    type Platform,
    SyncProfileSchema,
    type SyncProfile,
    UserSchema,
    type User,
    RoomSchema,
    type Room,
    ChatMessageSchema,
    type ChatMessage,
    WSMessageSchema,
    type WSMessage,
    generateRandomName as generateLegacyRandomName
} from './schemas';

export * from './media';
export * from './names';
