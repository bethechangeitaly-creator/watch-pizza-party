import express from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { CreateRoomRequestSchema, PROTOCOL_VERSION, UPDATE_REQUIRED_MESSAGE } from '@watch-party/shared';
import { RoomStore } from './roomStore';
import { setupSocketHandlers } from './socketHandlers';
import { IP_LIMITS, KeyedLimiter, clientIp, isAllowedOrigin } from './rateLimit';

export type AppOptions = {
    now?: () => number;
    giphyApiKey?: string;
    sweepIntervalMs?: number;
    fetchImpl?: typeof fetch;
    /** Extra exact origins allowed by CORS, on top of chrome-extension:// and localhost. */
    allowedOrigins?: string[];
};

export function createApp(opts: AppOptions = {}) {
    const now = opts.now ?? Date.now;
    const sweepIntervalMs = opts.sweepIntervalMs ?? 5000;

    const extraOrigins = opts.allowedOrigins ?? [];
    const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
        cb(null, isAllowedOrigin(origin, extraOrigins));

    const app = express();
    app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST'] }));
    app.use(express.json({ limit: '4kb' }));
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });

    const httpServer: HttpServer = createServer(app);
    const io = new Server(httpServer, {
        maxHttpBufferSize: 16 * 1024,
        cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    });
    const roomCreation = new KeyedLimiter(IP_LIMITS.createRoom[0], IP_LIMITS.createRoom[1], now);
    const store = new RoomStore(now);

    app.post('/rooms', (req, res) => {
        if (!roomCreation.take(clientIp(req.headers, req.socket.remoteAddress ?? 'unknown'))) {
            res.status(429).json({ code: 'rate_limited' });
            return;
        }
        const parsed = CreateRoomRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            if (req.body?.protocolVersion !== PROTOCOL_VERSION) {
                res.status(426).json({ code: 'update_required', error: UPDATE_REQUIRED_MESSAGE });
            } else {
                res.status(400).json({ code: 'invalid_message', error: 'Invalid request.' });
            }
            return;
        }
        res.json(store.createRoom(parsed.data.username));
    });

    const sockets = setupSocketHandlers(io, store, { now });

    const runSweep = () => {
        const result = store.sweep();
        for (const roomId of result.changedRoomIds) sockets.broadcastRoomState(roomId);
    };
    const sweepTimer = sweepIntervalMs > 0 ? setInterval(runSweep, sweepIntervalMs) : null;

    const close = () => new Promise<void>((resolve) => {
        if (sweepTimer) clearInterval(sweepTimer);
        io.close(() => resolve());
    });

    return { httpServer, io, store, runSweep, close };
}
