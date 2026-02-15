import { Server, Socket } from 'socket.io';
import { RoomManager } from './roomManager';
import { Platform, SyncProfile, WSMessageSchema } from '@watch-party/shared';

type HostSnapshot = {
    seq: number;
    mediaId: string;
    url: string;
    title?: string;
    platform: Platform;
    syncProfile: SyncProfile;
    timeSeconds: number;
    isPlaying: boolean;
    playbackRate: number;
    inAd: boolean;
    syncAggression: number;
    capturedAt: number;
    username?: string;
};

type ViewerRuntimeStatus = {
    username: string;
    appliedSeq: number;
    driftSeconds: number;
    blockedByAd: boolean;
    state: 'playing' | 'paused' | 'buffering' | 'ad';
    updatedAt: number;
    lastOutOfSyncEventAt: number;
};

function formatSeconds(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

function clampPlaybackRate(raw: number): number {
    if (!Number.isFinite(raw)) return 1;
    return Math.min(4, Math.max(0.25, raw));
}

function clampSyncAggression(raw: number): number {
    if (!Number.isFinite(raw)) return 50;
    return Math.min(100, Math.max(0, raw));
}

export function setupWS(io: Server, roomManager: RoomManager) {
    const socketToUser = new Map<string, { roomId: string; userId: string }>();
    const latestSnapshotByRoom = new Map<string, HostSnapshot>();
    const latestNavigateSeqByRoom = new Map<string, number>();
    const viewerStatusByRoom = new Map<string, Map<string, ViewerRuntimeStatus>>();

    const emitSystemEvent = (
        roomId: string,
        payload: {
            kind:
                | 'host.play'
                | 'host.pause'
                | 'host.seek'
                | 'host.media_change'
                | 'host.sync_forced'
                | 'viewer.out_of_sync'
                | 'viewer.request_sync'
                | 'viewer.ad_finished';
            text: string;
            username?: string;
            targetUsername?: string;
            driftSeconds?: number;
        }
    ) => {
        io.to(roomId).emit('message', {
            type: 'sync.system_event',
            payload: {
                ...payload,
                timestamp: Date.now()
            }
        });
    };

    const emitRoomState = (roomId: string) => {
        const updatedRoom = roomManager.getRoom(roomId);
        if (updatedRoom) {
            io.to(roomId).emit('message', { type: 'room.state', payload: updatedRoom });
        }
    };

    io.on('connection', (socket: Socket) => {
        console.log(`[WS] New connection: ${socket.id}`);

        let currentRoomId: string | null = null;
        let currentUserId: string | null = null;
        let currentUsername: string | null = null;
        let currentAvatarColor: string = '#888';

        socket.on('message', (raw: unknown) => {
            try {
                const parsed = WSMessageSchema.safeParse(raw);
                if (!parsed.success) {
                    console.error(`[WS] Invalid message from ${socket.id}:`, parsed.error);
                    return;
                }

                const msg = parsed.data;

                switch (msg.type) {
                    case 'room.join': {
                        const { roomId, username } = msg.payload;
                        console.log(`[WS] JOIN ATTEMPT: "${username || 'anonymous'}" -> Room: ${roomId}`);

                        const result = roomManager.joinRoom(roomId, username);
                        if (!result) {
                            socket.emit('message', { type: 'error', payload: { message: 'Room not found. Please verify the code.' } });
                            return;
                        }

                        const room = roomManager.getRoom(roomId);
                        if (!room) return;

                        currentRoomId = roomId;
                        currentUserId = result.userId;
                        currentUsername = result.username;

                        const user = room.participants.find((participant) => participant.id === result.userId);
                        if (user) {
                            currentAvatarColor = user.avatarColor;
                        }

                        socketToUser.set(socket.id, { roomId, userId: result.userId });
                        socket.join(roomId);
                        console.log(`[WS] JOIN SUCCESS: ${currentUsername} joined ${roomId}`);

                        // Fallback snapshot from room state for late joiners
                        if (!latestSnapshotByRoom.has(roomId) && room.currentUrl) {
                            latestSnapshotByRoom.set(roomId, {
                                seq: 0,
                                mediaId: room.currentUrl,
                                url: room.currentUrl,
                                title: room.currentTitle,
                                platform: room.currentPlatform || 'unknown',
                                syncProfile: room.syncProfile || 'other',
                                timeSeconds: room.referenceTimeSeconds,
                                isPlaying: room.isPlaying,
                                playbackRate: 1,
                                inAd: false,
                                syncAggression: 50,
                                capturedAt: room.referenceUpdatedAt || Date.now()
                            });
                        }

                        emitRoomState(roomId);

                        const snapshot = latestSnapshotByRoom.get(roomId);
                        if (snapshot) {
                            socket.emit('message', { type: 'sync.host_snapshot', payload: snapshot });
                        }
                        break;
                    }

                    case 'sync.host_snapshot':
                    case 'sync.force_snapshot': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (!room || room.hostId !== currentUserId) return;

                        const previous = latestSnapshotByRoom.get(currentRoomId);
                        if (previous && msg.payload.seq <= previous.seq) return;

                        const safeSnapshot: HostSnapshot = {
                            seq: msg.payload.seq,
                            mediaId: msg.payload.mediaId,
                            url: msg.payload.url,
                            title: msg.payload.title,
                            platform: msg.payload.platform,
                            syncProfile: msg.payload.syncProfile || 'other',
                            timeSeconds: Math.max(0, msg.payload.timeSeconds),
                            isPlaying: msg.payload.isPlaying,
                            playbackRate: clampPlaybackRate(msg.payload.playbackRate),
                            inAd: Boolean(msg.payload.inAd),
                            syncAggression: clampSyncAggression(msg.payload.syncAggression),
                            capturedAt: Number.isFinite(msg.payload.capturedAt) ? msg.payload.capturedAt : Date.now(),
                            username: currentUsername
                        };

                        latestSnapshotByRoom.set(currentRoomId, safeSnapshot);
                        console.log(
                            `[WS] HOST SNAPSHOT: room=${currentRoomId} seq=${safeSnapshot.seq} playing=${safeSnapshot.isPlaying} t=${safeSnapshot.timeSeconds.toFixed(2)} (${formatSeconds(safeSnapshot.timeSeconds)}) rate=${safeSnapshot.playbackRate.toFixed(2)} ad=${safeSnapshot.inAd} sync=${safeSnapshot.syncAggression} profile=${safeSnapshot.syncProfile}`
                        );

                        roomManager.updateUrl(currentRoomId, {
                            url: safeSnapshot.url,
                            title: safeSnapshot.title,
                            platform: safeSnapshot.platform,
                            syncProfile: safeSnapshot.syncProfile,
                            timeSeconds: safeSnapshot.timeSeconds,
                            isPlaying: safeSnapshot.isPlaying
                        });

                        io.to(currentRoomId).emit('message', { type: 'sync.host_snapshot', payload: safeSnapshot });
                        if (msg.type === 'sync.force_snapshot') {
                            io.to(currentRoomId).emit('message', { type: 'sync.force_snapshot', payload: safeSnapshot });
                        }
                        emitRoomState(currentRoomId);

                        if (previous) {
                            const mediaChanged = previous.mediaId !== safeSnapshot.mediaId;
                            if (mediaChanged) {
                                emitSystemEvent(currentRoomId, {
                                    kind: 'host.media_change',
                                    text: `${currentUsername} changed video`,
                                    username: currentUsername
                                });
                            }

                            if (previous.isPlaying !== safeSnapshot.isPlaying) {
                                emitSystemEvent(currentRoomId, {
                                    kind: safeSnapshot.isPlaying ? 'host.play' : 'host.pause',
                                    text: safeSnapshot.isPlaying
                                        ? `${currentUsername} pressed play`
                                        : `${currentUsername} paused at ${formatSeconds(safeSnapshot.timeSeconds)}`,
                                    username: currentUsername
                                });
                            }

                            const expectedDelta = previous.isPlaying && !previous.inAd
                                ? ((safeSnapshot.capturedAt - previous.capturedAt) / 1000) * previous.playbackRate
                                : 0;
                            const observedDelta = safeSnapshot.timeSeconds - previous.timeSeconds;
                            const seekDetected = !mediaChanged && Math.abs(observedDelta - expectedDelta) > 1.25;

                            if (seekDetected) {
                                emitSystemEvent(currentRoomId, {
                                    kind: 'host.seek',
                                    text: `${currentUsername} jumped to ${formatSeconds(safeSnapshot.timeSeconds)}`,
                                    username: currentUsername
                                });
                            }
                        }

                        if (msg.type === 'sync.force_snapshot') {
                            emitSystemEvent(currentRoomId, {
                                kind: 'host.sync_forced',
                                text: `${currentUsername} forced sync`,
                                username: currentUsername
                            });
                        }
                        break;
                    }

                    case 'sync.viewer_status': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (!room || room.hostId === currentUserId) return;

                        let roomStatuses = viewerStatusByRoom.get(currentRoomId);
                        if (!roomStatuses) {
                            roomStatuses = new Map<string, ViewerRuntimeStatus>();
                            viewerStatusByRoom.set(currentRoomId, roomStatuses);
                        }

                        const previousStatus = roomStatuses.get(currentUserId);
                        const now = Date.now();
                        const nextStatus: ViewerRuntimeStatus = {
                            username: currentUsername,
                            appliedSeq: msg.payload.appliedSeq,
                            driftSeconds: msg.payload.driftSeconds,
                            blockedByAd: msg.payload.blockedByAd,
                            state: msg.payload.state,
                            updatedAt: now,
                            lastOutOfSyncEventAt: previousStatus?.lastOutOfSyncEventAt ?? 0
                        };

                        const driftAbs = Math.abs(nextStatus.driftSeconds);
                        if (driftAbs > 2.2 && now - nextStatus.lastOutOfSyncEventAt > 8000) {
                            emitSystemEvent(currentRoomId, {
                                kind: 'viewer.out_of_sync',
                                text: `${currentUsername} is out of sync (${nextStatus.driftSeconds > 0 ? '+' : ''}${nextStatus.driftSeconds.toFixed(1)}s). Host should press Sync.`,
                                username: currentUsername,
                                targetUsername: currentUsername,
                                driftSeconds: nextStatus.driftSeconds
                            });
                            nextStatus.lastOutOfSyncEventAt = now;
                        }

                        if (previousStatus?.blockedByAd && !nextStatus.blockedByAd) {
                            emitSystemEvent(currentRoomId, {
                                kind: 'viewer.ad_finished',
                                text: `${currentUsername} finished the ad and can sync again`,
                                username: currentUsername,
                                targetUsername: currentUsername
                            });
                        }

                        roomStatuses.set(currentUserId, nextStatus);
                        break;
                    }

                    case 'sync.viewer_request_sync': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (!room || room.hostId === currentUserId) return;

                        const reason = msg.payload.reason?.trim();
                        const normalizedReason =
                            reason === 'control-back' ||
                            reason === 'control-pause' ||
                            reason === 'control-play' ||
                            reason === 'control-forward'
                                ? reason
                                : 'manual-request';
                        const requestTextByReason: Record<
                            'manual-request' | 'control-back' | 'control-pause' | 'control-play' | 'control-forward',
                            string
                        > = {
                            'manual-request': `🔄 ${currentUsername} asked for sync`,
                            'control-back': `⏪ ${currentUsername} asked host to go back`,
                            'control-pause': `⏸️ ${currentUsername} asked host to pause`,
                            'control-play': `▶️ ${currentUsername} asked host to play`,
                            'control-forward': `⏩ ${currentUsername} asked host to go forward`
                        };
                        io.to(currentRoomId).emit('message', {
                            type: 'sync.viewer_request_sync',
                            payload: {
                                reason: normalizedReason,
                                username: currentUsername
                            }
                        });
                        emitSystemEvent(currentRoomId, {
                            kind: 'viewer.request_sync',
                            text: requestTextByReason[normalizedReason],
                            username: currentUsername,
                            targetUsername: currentUsername
                        });
                        break;
                    }

                    case 'sync.navigate': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (!room || room.hostId !== currentUserId) return;

                        const requestedSeq = Number.isFinite(msg.payload.seq) ? Number(msg.payload.seq) : undefined;
                        const lastSeq = latestNavigateSeqByRoom.get(currentRoomId) ?? 0;
                        const nextSeq = requestedSeq !== undefined ? requestedSeq : lastSeq + 1;
                        if (nextSeq <= lastSeq) return;
                        latestNavigateSeqByRoom.set(currentRoomId, nextSeq);

                        const previousUrl = room.currentUrl;
                        roomManager.updateUrl(currentRoomId, {
                            url: msg.payload.url,
                            title: msg.payload.title,
                            platform: msg.payload.platform,
                            syncProfile: msg.payload.syncProfile,
                            timeSeconds: msg.payload.timeSeconds,
                            isPlaying: msg.payload.isPlaying
                        });

                        const updatedRoom = roomManager.getRoom(currentRoomId);
                        if (updatedRoom) {
                            const existingSnapshot = latestSnapshotByRoom.get(currentRoomId);
                            latestSnapshotByRoom.set(currentRoomId, {
                                seq: Math.max(existingSnapshot?.seq ?? 0, nextSeq),
                                mediaId: updatedRoom.currentUrl || msg.payload.url,
                                url: updatedRoom.currentUrl || msg.payload.url,
                                title: updatedRoom.currentTitle || msg.payload.title,
                                platform: updatedRoom.currentPlatform || msg.payload.platform || 'unknown',
                                syncProfile: updatedRoom.syncProfile || msg.payload.syncProfile || 'other',
                                timeSeconds: updatedRoom.referenceTimeSeconds,
                                isPlaying: updatedRoom.isPlaying,
                                playbackRate: existingSnapshot?.playbackRate ?? 1,
                                inAd: false,
                                syncAggression: existingSnapshot?.syncAggression ?? 50,
                                capturedAt: Date.now(),
                                username: currentUsername
                            });
                        }

                        io.to(currentRoomId).emit('message', {
                            type: 'sync.navigate',
                            payload: {
                                ...msg.payload,
                                seq: nextSeq,
                                username: currentUsername,
                                at: Date.now()
                            }
                        });
                        emitRoomState(currentRoomId);

                        if (msg.payload.url !== previousUrl) {
                            emitSystemEvent(currentRoomId, {
                                kind: 'host.media_change',
                                text: `${currentUsername} changed video/page`,
                                username: currentUsername
                            });
                        }
                        break;
                    }

                    // Backward compatibility path
                    case 'room.update_url': {
                        if (!currentRoomId || !currentUserId) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (room && room.hostId === currentUserId) {
                            roomManager.updateUrl(currentRoomId, {
                                url: msg.payload.url,
                                title: msg.payload.title,
                                platform: msg.payload.platform,
                                syncProfile: msg.payload.syncProfile,
                                timeSeconds: msg.payload.timeSeconds,
                                isPlaying: msg.payload.isPlaying
                            });
                            emitRoomState(currentRoomId);
                        }
                        break;
                    }

                    case 'chat.send': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const message = roomManager.addMessage(currentRoomId, currentUserId, currentUsername, currentAvatarColor, msg.payload.text);
                        if (message) {
                            io.to(currentRoomId).emit('message', { type: 'chat.message', payload: message });
                        }
                        break;
                    }

                    // Backward compatibility path
                    case 'sync.play_intent':
                    case 'sync.pause_intent':
                    case 'sync.set_reference_time': {
                        if (!currentRoomId || !currentUserId || !currentUsername) return;
                        const room = roomManager.getRoom(currentRoomId);
                        if (!room || room.hostId !== currentUserId) return;

                        if (msg.type === 'sync.set_reference_time') {
                            roomManager.updateReferenceTime(currentRoomId, msg.payload.timeSeconds);
                        } else if (msg.type === 'sync.play_intent') {
                            roomManager.updatePlaybackState(currentRoomId, true, msg.payload.timeSeconds);
                        } else if (msg.type === 'sync.pause_intent') {
                            roomManager.updatePlaybackState(currentRoomId, false, msg.payload.timeSeconds);
                        }

                        const broadcastMsg = {
                            ...msg,
                            payload: { ...msg.payload, username: currentUsername }
                        };
                        io.to(currentRoomId).emit('message', broadcastMsg);
                        emitRoomState(currentRoomId);
                        break;
                    }
                }
            } catch (err) {
                console.error('[WS] Error handling message:', err);
            }
        });

        socket.on('disconnect', () => {
            const data = socketToUser.get(socket.id);
            if (!data) {
                console.log(`[WS] DISCONNECT: ${socket.id} (never joined room)`);
                return;
            }

            socketToUser.delete(socket.id);

            const viewerStatuses = viewerStatusByRoom.get(data.roomId);
            if (viewerStatuses) {
                viewerStatuses.delete(data.userId);
                if (viewerStatuses.size === 0) {
                    viewerStatusByRoom.delete(data.roomId);
                }
            }

            const isStillConnected = Array.from(socketToUser.values()).some((value) => value.userId === data.userId);
            if (!isStillConnected) {
                roomManager.leaveRoom(data.roomId, data.userId);
                emitRoomState(data.roomId);
            }
        });
    });
}
