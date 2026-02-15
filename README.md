# Watch Party Companion 🎬

A production-ready Chrome Extension (Manifest V3) + Backend for coordinated viewing sessions with manual sync and real-time chat.

## 🚀 Features

- **Room-based Chat**: Real-time messaging with your watch party.
- **Manual Sync Engine**: No control over Netflix/YouTube. Coordination is human-to-human!
  - **Host Reference**: Host sets the canonical timestamp.
  - **Sync Hints**: Automated suggestions (e.g., "You are +4s ahead. Pause for 4s.").
  - **Play/Pause Intents**: Announce your actions to the room.
  - **3-2-1 Countdown**: Synchronized visual countdown for starting playback together.
- **Compliance First**: 
  - ❌ NO script injection into streaming sites.
  - ❌ NO modification of player DOM/variables.
  - ❌ NO bypassing of DRM/EME.
- **Side Panel Support**: Experience the room right next to your video.

## 🛠️ Tech Stack

- **Monorepo**: Root, `apps/extension`, `apps/server`, `packages/shared`.
- **Extension**: Vite, React, Tailwind CSS, Lucide Icons, Socket.io-client.
- **Backend**: Node.js, TypeScript, Express, Socket.io, SQLite (Room persistence).
- **Shared**: Zod validation schemas and shared TypeScript types.

## 🏁 Getting Started

### 1. Installation
```bash
# Install dependencies (requires pnpm)
pnpm install
```

### 2. Start Backend
```bash
# Start server in dev mode
cd apps/server
pnpm dev
```
*Server runs on http://localhost:3001*

### 3. Build Extension
```bash
# Build the extension
cd apps/extension
pnpm build
```
The build artifacts will be in `apps/extension/dist`.

### 4. Load in Chrome
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `apps/extension/dist` folder.

## 📖 Manual Sync Guide

1. **Host** creates a room and shares the **Room ID**.
2. **Viewers** join with their names.
3. Use the **"Set Reference Time"** (Host only) to tell everyone where the video should be.
4. If you are starting a new movie, use the **"Sync Countdown"** to count down from 3 together.
5. If someone needs to pause, they click **"Pause Intent"**, which tells everyone to pause.

## 🐳 Docker Deployment
```bash
docker-compose up -d
```

## 🛡️ Protocol Spec
All messages are validated using Zod schemas defined in `packages/shared/src/schemas.ts`.
Key message types:
- `room.join`, `room.state`
- `chat.send`, `chat.message`
- `sync.set_reference_time`
- `sync.play_intent`, `sync.pause_intent`
- `sync.countdown_start`
