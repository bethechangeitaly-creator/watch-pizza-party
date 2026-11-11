import express from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager';
import { setupWS } from './wsHandler';

export type AppOptions = {
    now?: () => number;
    giphyApiKey?: string;
    sweepIntervalMs?: number;
    fetchImpl?: typeof fetch;
};

export function createApp(opts: AppOptions = {}) {
    const sweepIntervalMs = opts.sweepIntervalMs ?? 5000;

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });

    const httpServer: HttpServer = createServer(app);
    const io = new Server(httpServer, { cors: { origin: '*' } });
    const store = new RoomManager();

    app.post('/rooms', (req, res) => {
        const { roomId, hostId, username } = store.createRoom(req.body?.hostUsername || undefined);
        res.json({ roomId, hostId, username });
    });

    setupWS(io, store);

    const runSweep = () => store.cleanupRooms();
    const sweepTimer = sweepIntervalMs > 0 ? setInterval(runSweep, sweepIntervalMs) : null;

    const close = () => new Promise<void>((resolve) => {
        if (sweepTimer) clearInterval(sweepTimer);
        io.close(() => resolve());
    });

    return { httpServer, io, store, runSweep, close };
}
