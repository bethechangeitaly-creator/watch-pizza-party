# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Watch Party Codex is a Chrome Extension (Manifest V3) + Node.js backend for synchronized watch parties. It provides real-time chat and manual sync coordination across streaming platforms (Netflix, YouTube). The project uses **compliance-first** design: no script injection into streaming sites, no DOM modification of players, no DRM/EME bypassing.

## Monorepo Structure

- **`apps/extension`** — Chrome Extension (React 18, Vite, Tailwind CSS, Socket.io-client)
- **`apps/server`** — Backend (Express, Socket.io, in-memory room state)
- **`packages/shared`** — Shared Zod schemas and TypeScript types (`@watch-party/shared`)

Workspace management uses **npm workspaces** (configured in root `package.json`). A `pnpm-workspace.yaml` exists for pnpm compatibility. Package names follow `@watch-party/*` convention.

## Build & Development Commands

```bash
# Install dependencies
pnpm install       # or: npm install

# Start server (builds shared package first, then runs server with hot-reload)
npm run dev:server

# Build the Chrome extension
npm run build:extension

# Run tests across all workspaces
npm test

# Per-workspace commands
cd apps/server && pnpm dev          # Server dev mode (ts-node-dev, port 3005 by default)
cd apps/server && pnpm build        # Compile server TypeScript to dist/
cd apps/extension && pnpm build     # TypeScript check + Vite production build
cd apps/extension && pnpm dev       # Vite dev server for extension

# Docker
docker-compose up -d                # Server on port 3001
```

After building the extension, load `apps/extension/dist` as an unpacked extension in `chrome://extensions/`.

## Architecture

```
Chrome Extension                         Node.js Server
┌──────────────────────────┐             ┌──────────────────────┐
│  Side Panel / Popup      │             │  Express REST API    │
│  (React UI)              │             │  POST /rooms         │
│         ↕ chrome.runtime │             │  GET  /rooms/:id     │
│  Background Service Worker│◄──Socket.io──►  WebSocket Handler │
│  (single WS connection)  │             │  (wsHandler.ts)      │
│         ↕ chrome.runtime │             │         ↕            │
│  Content Script          │             │  RoomManager         │
│  (video page interaction)│             │  (in-memory state)   │
└──────────────────────────┘             └──────────────────────┘
```

**Extension internal messaging**: React UI ↔ Background Service Worker ↔ Content Script, all via `chrome.runtime.sendMessage()`.

**Extension ↔ Server**: Single persistent WebSocket (Socket.io) managed by the background service worker.

### Key Extension Files

- `src/background.ts` (~3000 lines) — Service worker: WebSocket connection, session management, sync engine orchestration
- `src/content.ts` (~1260 lines) — Content script injected on Netflix/YouTube pages: video player interaction, floating bubble UI
- `src/App.tsx` — Main React app with session state management
- `src/components/Landing.tsx` — Room creation/join UI
- `src/components/RoomView.tsx` — Main room interface during active session
- `src/components/Chat.tsx` — Real-time chat

### Server State

Rooms are held **in-memory** (no database). Rooms expire 5 minutes after the last user leaves. A cleanup job runs every 60 seconds. Chat history is capped at 100 messages per room. Host role migrates automatically on disconnect.

### WebSocket Protocol

All messages are validated with Zod schemas in `packages/shared/src/schemas.ts`. Message types use dot-notation namespacing:
- **Room**: `room.join`, `room.state`, `room.update_url`
- **Sync**: `sync.host_snapshot`, `sync.force_snapshot`, `sync.viewer_status`, `sync.navigate`, `sync.set_reference_time`, `sync.play_intent`, `sync.pause_intent`, `sync.system_event`
- **Chat**: `chat.send`, `chat.message`

### Sync Engine

The sync engine in `background.ts` has configurable aggression (0–100 scale) and platform-specific profiles (`auto`, `youtube`, `netflix`, `other`). Host broadcasts snapshots at intervals (1.3s when playing, 12s when paused); viewers detect drift and auto-correct. Special handling exists for Netflix seek cooldowns and YouTube playback rate quirks.

## Environment Variables

- `PORT` — Server port (default: 3005 in dev, 3001 in Docker)
- `NODE_ENV` — `production` or `development`

## TypeScript Configuration

- Extension: ESNext target, bundler module resolution, `react-jsx`, chrome types
- Server: ESNext target, CommonJS output to `dist/`
- Shared: ESNext target, CommonJS with declaration files to `dist/`
- All packages use path aliases to resolve `@watch-party/shared`

## Important Conventions

- The shared package **must be built before** the server (the `dev:server` script handles this automatically)
- User display names are randomly generated as `Color_Fruit` combinations with associated hex colors (see `generateRandomName()` in shared schemas)
- The extension supports incognito mode with isolated session storage
- Vite config uses multi-entry build for popup, content script, and background service worker with separate output bundles
