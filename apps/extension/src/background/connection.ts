import { io, type Socket } from 'socket.io-client';
import {
    ClockSync,
    MESSAGE_EVENT,
    ServerMessageSchema,
    TIME_EVENT,
    type ClientMessage,
    type ServerMessage,
} from '@watch-party/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export type ConnectionHandlers = {
    onMessage: (m: ServerMessage) => void;
    onStatus: (s: ConnectionStatus) => void;
    onClock?: (offsetMs: number) => void;
};

const INITIAL_SAMPLES = 5;
const INITIAL_SPACING_MS = 150;
const SAMPLE_EVERY_MS = 15_000;

/** One Socket.IO connection plus NTP-style clock sampling against the server. */
export class ServerConnection {
    readonly clock = new ClockSync();
    private socket: Socket | null = null;
    private timers: ReturnType<typeof setTimeout>[] = [];

    constructor(private readonly opts: { url: string; handlers: ConnectionHandlers; ioFactory?: typeof io }) {}

    connect(): void {
        if (this.socket) return;
        const { handlers } = this.opts;
        const socket = (this.opts.ioFactory ?? io)(this.opts.url, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelayMax: 10_000,
        });
        this.socket = socket;
        socket.on('connect', () => {
            handlers.onStatus('connected');
            this.startClockSampling();
        });
        socket.on('disconnect', () => {
            this.stopClockSampling();
            handlers.onStatus('disconnected');
        });
        socket.on('connect_error', () => handlers.onStatus('disconnected'));
        socket.on(MESSAGE_EVENT, (raw: unknown) => {
            const parsed = ServerMessageSchema.safeParse(raw);
            if (parsed.success) handlers.onMessage(parsed.data);
        });
        handlers.onStatus('connecting');
    }

    disconnect(): void {
        this.stopClockSampling();
        if (!this.socket) return;
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
    }

    send(message: ClientMessage): void {
        // Drop while offline: the session re-joins on reconnect, and stale actions shouldn't replay.
        if (this.socket?.connected) this.socket.emit(MESSAGE_EVENT, message);
    }

    private async sample(): Promise<void> {
        const socket = this.socket;
        if (!socket?.connected) return;
        const sentAt = Date.now();
        try {
            const serverMs = await socket.timeout(2000).emitWithAck(TIME_EVENT);
            this.clock.addSample(sentAt, Number(serverMs), Date.now());
            const offset = this.clock.offsetMs;
            if (offset !== null) this.opts.handlers.onClock?.(offset);
        } catch {
            // Timed out; the next sample will try again.
        }
    }

    private startClockSampling(): void {
        this.stopClockSampling();
        for (let i = 0; i < INITIAL_SAMPLES; i += 1) {
            this.timers.push(setTimeout(() => void this.sample(), i * INITIAL_SPACING_MS));
        }
        this.timers.push(setInterval(() => void this.sample(), SAMPLE_EVERY_MS));
    }

    private stopClockSampling(): void {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers = [];
    }
}
