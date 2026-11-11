import {
    PROTOCOL_VERSION,
    type ClientMessage,
    type CreateRoomResponse,
    type ServerMessage,
    type SyncRequestReason,
    type Timeline,
    type ViewerSyncState,
} from '@watch-party/shared';
import type { PublicSession, TimelineEntry } from '../lib/messages';
import type { ConnectionHandlers } from './connection';
import { clearSession, loadSession, saveSession, type KeyValueArea, type PersistedSession } from './sessionStore';
import { CreateRoomError } from './createRoom';

export type { ConnectionHandlers };

export type ServerConnectionLike = {
    connect(): void;
    disconnect(): void;
    send(m: ClientMessage): void;
    clock: { offsetMs: number | null };
};

export type SessionDeps = {
    storage: KeyValueArea;
    /** chrome.storage.session: survives worker restarts, cleared when the browser restarts. */
    sessionArea: KeyValueArea;
    storageKey: string;
    now: () => number;
    serverUrl: () => string;
    connectionFactory: (url: string, handlers: ConnectionHandlers) => ServerConnectionLike;
    createRoom: (args: { baseUrl: string; username: string; onWaking: () => void }) => Promise<CreateRoomResponse>;
    getTab: (tabId: number) => Promise<{ title: string } | null>;
    emit: (state: PublicSession) => void;
    onTimeline: (t: Timeline, force: boolean) => void;
    onEntries: (entries: TimelineEntry[], replace: boolean) => void;
    onHostRequest: (reason: SyncRequestReason) => void;
    onClock?: (offsetMs: number) => void;
    /** A dropped connection came back as the same member: anything sent while offline was lost. */
    onRejoined?: () => void;
};

const FATAL_CODES = new Set(['room_not_found', 'update_required', 'room_full']);
export const MEDIA_TAB_KEY = 'wpp.mediaTab';
const UNREAD_CAP = 999;

/**
 * Owns the party session in the background: identity, connection, persisted token.
 * Everything chrome-specific is injected so this can be unit-tested.
 */
export class SessionController {
    private s: PublicSession;
    private persisted: PersistedSession | null = null;
    private connection: ServerConnectionLike | null = null;
    private desiredUsername = '';
    private panelOpen = false;
    private timeline: Timeline | null = null;

    constructor(private readonly deps: SessionDeps) {
        this.s = this.idleState();
    }

    state(): PublicSession {
        return this.s;
    }

    latestTimeline(): Timeline | null {
        return this.timeline;
    }

    clockOffsetMs(): number {
        return this.connection?.clock.offsetMs ?? 0;
    }

    async restore(): Promise<void> {
        const saved = await loadSession(this.deps.storage, this.deps.storageKey, this.deps.now());
        if (!saved) {
            this.publish();
            return;
        }
        this.persisted = saved;
        this.desiredUsername = saved.username;
        // Tab ids are reused after a browser restart: only trust one recorded in this browser session.
        const sameBrowserSession = (await this.deps.sessionArea.get(MEDIA_TAB_KEY))[MEDIA_TAB_KEY] === saved.mediaTabId;
        const tab = saved.mediaTabId !== null && sameBrowserSession ? await this.deps.getTab(saved.mediaTabId) : null;
        this.s = {
            ...this.idleState(),
            status: 'connecting',
            roomId: saved.roomId,
            mediaTab: tab && saved.mediaTabId !== null ? { tabId: saved.mediaTabId, title: tab.title } : null,
        };
        this.publish();
        this.openConnection();
    }

    async create(username: string, tabId: number, tabTitle: string): Promise<void> {
        this.reset();
        this.s = { ...this.idleState(), status: 'connecting', mediaTab: { tabId, title: tabTitle } };
        this.publish();
        try {
            const room = await this.deps.createRoom({
                baseUrl: this.deps.serverUrl(),
                username,
                onWaking: () => this.patch({ status: 'waking' }),
            });
            this.persisted = { roomId: room.roomId, token: room.token, username: room.username, mediaTabId: tabId, savedAt: this.deps.now() };
            await saveSession(this.deps.storage, this.deps.storageKey, this.persisted);
            this.desiredUsername = room.username;
            this.patch({ status: 'connecting', roomId: room.roomId });
            this.openConnection();
        } catch (error) {
            const code = error instanceof CreateRoomError ? error.code : undefined;
            const message = error instanceof Error ? error.message : String(error);
            this.s = { ...this.idleState(), status: 'error', error: { message, ...(code ? { code } : {}) } };
            this.publish();
        }
    }

    async join(roomId: string, username: string, tabId: number, tabTitle: string): Promise<void> {
        const keepToken = this.persisted?.roomId === roomId ? this.persisted : null;
        this.reset();
        this.persisted = keepToken;
        this.desiredUsername = username;
        this.s = { ...this.idleState(), status: 'connecting', roomId, mediaTab: { tabId, title: tabTitle } };
        this.publish();
        this.openConnection();
    }

    async leave(): Promise<void> {
        this.connection?.send({ type: 'room.leave', payload: {} });
        this.reset();
        await clearSession(this.deps.storage, this.deps.storageKey);
        this.s = this.idleState();
        this.publish();
    }

    async useTab(tabId: number, title: string): Promise<void> {
        this.patch({ mediaTab: { tabId, title } });
        await this.persistMediaTab(tabId);
    }

    clearMediaTab(): void {
        this.patch({ mediaTab: null, mySync: null });
        void this.persistMediaTab(null);
    }

    send(message: ClientMessage): void {
        this.connection?.send(message);
    }

    setPanelOpen(open: boolean): void {
        this.panelOpen = open;
        if (open && this.s.unread !== 0) this.patch({ unread: 0 });
    }

    setNeedsVideoClick(value: boolean): void {
        if (this.s.needsVideoClick !== value) this.patch({ needsVideoClick: value });
    }

    setMySync(state: ViewerSyncState | null): void {
        if (this.s.mySync !== state) this.patch({ mySync: state });
    }

    /** Re-publish (e.g. after the server URL changed). */
    refresh(): void {
        this.publish();
    }

    setVolumeState(gain: number, readyTabId: number | null): void {
        const volumeReady = readyTabId !== null && readyTabId === this.s.mediaTab?.tabId;
        if (this.s.volumeGain !== gain || this.s.volumeReady !== volumeReady) this.patch({ volumeGain: gain, volumeReady });
    }

    // ── internals ──────────────────────────────────────────────────────────────

    private idleState(): PublicSession {
        return {
            status: 'idle',
            roomId: null,
            me: null,
            isHost: false,
            room: null,
            mediaTab: null,
            mySync: null,
            serverUrl: this.deps.serverUrl(),
            error: null,
            volumeGain: 1,
            volumeReady: false,
            needsVideoClick: false,
            unread: 0,
        };
    }

    private patch(partial: Partial<PublicSession>): void {
        this.s = { ...this.s, ...partial };
        this.publish();
    }

    private recordMediaTab(): void {
        const tabId = this.s.mediaTab?.tabId ?? null;
        void this.deps.sessionArea.set({ [MEDIA_TAB_KEY]: tabId });
    }

    private lastRecordedTab: number | null | undefined = undefined;

    private publish(): void {
        this.s = { ...this.s, serverUrl: this.deps.serverUrl() };
        const tabId = this.s.mediaTab?.tabId ?? null;
        if (tabId !== this.lastRecordedTab) {
            this.lastRecordedTab = tabId;
            this.recordMediaTab();
        }
        this.deps.emit(this.s);
    }

    private reset(): void {
        this.connection?.disconnect();
        this.connection = null;
        this.persisted = null;
        this.timeline = null;
    }

    private async persistMediaTab(tabId: number | null): Promise<void> {
        if (!this.persisted) return;
        this.persisted = { ...this.persisted, mediaTabId: tabId, savedAt: this.deps.now() };
        await saveSession(this.deps.storage, this.deps.storageKey, this.persisted);
    }

    private openConnection(): void {
        const connection = this.deps.connectionFactory(this.deps.serverUrl(), {
            onMessage: (m) => this.onMessage(m),
            onStatus: (status) => {
                if (status === 'connected') this.sendJoin();
                if (status === 'disconnected' && this.s.status === 'joined') this.patch({ status: 'reconnecting' });
            },
            onClock: (offset) => this.deps.onClock?.(offset),
        });
        this.connection = connection;
        connection.connect();
    }

    private sendJoin(): void {
        const roomId = this.s.roomId;
        if (!roomId) return;
        const token = this.persisted?.roomId === roomId ? this.persisted.token : undefined;
        this.connection?.send({
            type: 'room.join',
            payload: {
                roomId,
                ...(token ? { token } : {}),
                username: this.desiredUsername,
                protocolVersion: PROTOCOL_VERSION,
            },
        });
    }

    private onMessage(message: ServerMessage): void {
        switch (message.type) {
            case 'room.joined': {
                const p = message.payload;
                const wasReconnecting = this.s.status === 'reconnecting';
                this.persisted = {
                    roomId: p.roomId,
                    token: p.token,
                    username: p.username,
                    mediaTabId: this.s.mediaTab?.tabId ?? null,
                    savedAt: this.deps.now(),
                };
                this.desiredUsername = p.username;
                void saveSession(this.deps.storage, this.deps.storageKey, this.persisted);
                this.patch({
                    status: 'joined',
                    roomId: p.roomId,
                    error: null,
                    me: { userId: p.userId, username: p.username, avatarColor: p.avatarColor },
                    isHost: this.s.room?.hostId === p.userId,
                });
                if (wasReconnecting && p.resumed) this.deps.onRejoined?.();
                return;
            }
            case 'room.state': {
                const room = message.payload;
                if (room.timeline) this.timeline = room.timeline;
                this.patch({ room, isHost: !!this.s.me && room.hostId === this.s.me.userId });
                return;
            }
            case 'chat.history':
                this.deps.onEntries(message.payload.messages.map((m) => ({ kind: 'chat', message: m })), true);
                return;
            case 'chat.message': {
                this.deps.onEntries([{ kind: 'chat', message: message.payload }], false);
                if (message.payload.userId !== this.s.me?.userId && !this.panelOpen) {
                    this.patch({ unread: Math.min(UNREAD_CAP, this.s.unread + 1) });
                }
                return;
            }
            case 'system.event':
                this.deps.onEntries([{ kind: 'system', event: message.payload }], false);
                return;
            case 'sync.timeline': {
                const timeline = message.payload;
                this.timeline = timeline;
                if (this.s.room) this.s = { ...this.s, room: { ...this.s.room, timeline } };
                this.deps.onTimeline(timeline, timeline.cause === 'force');
                this.publish();
                return;
            }
            case 'sync.request':
                if (this.s.isHost) this.deps.onHostRequest(message.payload.reason);
                return;
            case 'error': {
                const { code, message: text } = message.payload;
                if (FATAL_CODES.has(code)) {
                    this.reset();
                    void clearSession(this.deps.storage, this.deps.storageKey);
                    this.s = { ...this.idleState(), status: 'error', error: { code, message: text } };
                    this.publish();
                } else {
                    this.patch({ error: { code, message: text } });
                }
                return;
            }
        }
    }
}
