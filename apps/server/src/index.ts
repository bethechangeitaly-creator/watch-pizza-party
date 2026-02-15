import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { setupWS } from './wsHandler';

const app = express();
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const roomManager = new RoomManager();

const FOCUS_TEST_FRAME_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WatchParty Focus Test Frame</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #141414; color: #ddd; }
    .wrap { padding: 12px; }
    .label { font-size: 12px; margin-bottom: 8px; color: #9ca3af; }
    video { width: 100%; max-height: 260px; background: #000; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="label">Iframe Video</div>
    <video controls preload="metadata" src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"></video>
  </div>
</body>
</html>`;

const FOCUS_TEST_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WatchParty Focus Test</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0b0e14; color: #e5e7eb; }
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
    .card { background: #121826; border: 1px solid #273247; border-radius: 12px; padding: 12px; }
    .label { font-size: 12px; margin-bottom: 8px; color: #9ca3af; }
    video { width: 100%; max-height: 260px; background: #000; border-radius: 8px; }
    iframe { width: 100%; height: 320px; border: 1px solid #334155; border-radius: 10px; background: #000; }
    .banner { margin: 16px; padding: 12px; border: 1px dashed #334155; border-radius: 10px; background: #0f172a; }
    code { background: #111827; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="banner">
    <strong>Focus Test Page</strong><br />
    Use extension buttons <code>Focus Video</code> then <code>Next Video</code> to cycle between videos.
  </div>
  <div class="layout">
    <div class="card">
      <div class="label">Main Video A</div>
      <video controls preload="metadata" src="https://www.w3schools.com/html/mov_bbb.mp4"></video>
    </div>
    <div class="card">
      <div class="label">Main Video B</div>
      <video controls preload="metadata" src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"></video>
    </div>
    <div class="card" style="grid-column: span 2;">
      <div class="label">Embedded Frame With Another Video</div>
      <iframe src="/focus-test-frame" allowfullscreen></iframe>
    </div>
  </div>
</body>
</html>`;

// REST Endpoints
app.get('/', (req, res) => {
    res.send('🎬 Watch Party Companion API is running!');
});

app.get('/focus-test', (_req, res) => {
    res.type('html').send(FOCUS_TEST_HTML);
});

app.get('/focus-test-frame', (_req, res) => {
    res.type('html').send(FOCUS_TEST_FRAME_HTML);
});

app.post('/rooms', (req, res) => {
    const { hostUsername, initialMedia } = req.body;
    const safeInitialMedia = initialMedia && typeof initialMedia === 'object'
        ? {
            url: typeof initialMedia.url === 'string' ? initialMedia.url : undefined,
            title: typeof initialMedia.title === 'string' ? initialMedia.title : undefined,
            platform:
                initialMedia.platform === 'youtube' ||
                    initialMedia.platform === 'netflix' ||
                    initialMedia.platform === 'unknown'
                    ? initialMedia.platform
                    : undefined,
            syncProfile:
                initialMedia.syncProfile === 'youtube' ||
                    initialMedia.syncProfile === 'netflix' ||
                    initialMedia.syncProfile === 'other'
                    ? initialMedia.syncProfile
                    : undefined,
            timeSeconds: typeof initialMedia.timeSeconds === 'number' ? initialMedia.timeSeconds : undefined,
            isPlaying: typeof initialMedia.isPlaying === 'boolean' ? initialMedia.isPlaying : undefined
        }
        : undefined;

    const { roomId, hostId, username } = roomManager.createRoom(hostUsername || undefined, safeInitialMedia);
    res.json({ roomId, hostId, username, joinLink: `Room Code: ${roomId}` });
});

app.get('/rooms/:roomId', (req, res) => {
    const room = roomManager.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
});

// Setup WebSocket
setupWS(io, roomManager);

// Background Cleanup: Run every minute to prune old/empty rooms (5m linger)
setInterval(() => {
    roomManager.cleanupRooms();
}, 60000);

const PORT = process.env.PORT || 3005;

httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`--- WATCH PARTY SERVER STARTED ---`);
    console.log(`Port: ${PORT}`);
    console.log(`Mode: Manual Sync + Auto-Automation`);
});

// Periodic log to show server is alive
setInterval(() => {
    console.log(`${new Date().toLocaleTimeString()} - Server alive`);
}, 30000);
