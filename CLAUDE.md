# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Watch Pizza Party is a Chrome extension (Manifest V3) plus a Node.js server for synchronized YouTube and Netflix watch parties with chat. Version 2 uses protocol v2: server-issued identity tokens, a server-owned playback timeline, and clock-synced correction on viewers.

**What the extension does to pages (be accurate about this — it matters for store review):** a MAIN-world script (`player-bridge.js`) calls the YouTube and Netflix player APIs for play/pause/seek; the content script reads the `<video>` element and adds a floating bubble to the page. It does not touch DRM/EME, does not download or capture video, and only captures tab audio when the user turns on volume boost.

## Monorepo Structure

- `apps/extension` — Chrome extension (React 18, Vite 5, Tailwind 3, socket.io-client)
- `apps/server` — Express + Socket.IO server, all state in memory
- `packages/shared` — Zod protocol schemas and pure logic shared by both (`@watch-party/shared`)
- `e2e` — Playwright end-to-end tests (real Chromium + the built extension + YouTube)

npm workspaces. Package names use `@watch-party/*`.

## Commands

```bash
npm install
npm test                      # unit + server integration tests (Vitest), all workspaces
npm run e2e                   # Playwright: builds everything, starts a server on :3105, real YouTube sync
npm run dev:server            # server with hot reload (builds shared first), port 3005
npm run build:server
npm run build:extension       # tsc + vite (pages/worker) + classic content scripts + dist guard
VITE_SERVER_URL=https://… npm run package:extension   # release/watch-pizza-party-<version>.zip
```

Load `apps/extension/dist` as an unpacked extension in `chrome://extensions` for manual testing.

## Architecture

```
Side panel (React, src/panel) ──runtime messages──► Background service worker (src/background)
                                                     │  SessionController: identity, token, room state
Content script (src/content, media tab only) ◄──────┤  ServerConnection: Socket.IO + clock sync
  HostReporter (host) / ViewerFollower (viewers)    │
  player-bridge.js (MAIN world) for player APIs     └──Socket.IO──► Server: RoomStore + socketHandlers
```

- **Typed contract:** every message between panel, background and content is in `src/lib/messages.ts`; every client↔server message is validated by `ClientMessageSchema` / `ServerMessageSchema` in `packages/shared/src/protocol.ts`.
- **Identity:** `POST /rooms` and `room.join` return a token; resuming with the token keeps id, name and host role. Display names are never identity (duplicates become `Name 2`).
- **Presence:** members stay 30 s after their last socket drops (`reconnecting`), then are removed; the host migrates to the earliest connected member. Empty rooms are deleted after 30 min, with all their state (one `RoomRecord` per room).
- **Sync:** the host samples its player every 250 ms and sends `sync.host_update` on change (+5 s heartbeat). The server assigns `rev`, clamps the anchor time and broadcasts `sync.timeline`. Viewers compute the expected position from the timeline + clock offset and run `decideCorrection` (`packages/shared/src/sync/controller.ts`): rate nudge for small drift, seek for large drift, per-platform profiles.
- **Media tab:** bound explicitly on start/join/"Use this tab". Viewers are only ever navigated to `canonicalWatchUrl(platform, mediaId)`. Content scripts run no timers unless activated for the bound tab.
- **Limits:** 16 KiB frames, Zod max lengths, per-socket token buckets and per-IP limits (`apps/server/src/rateLimit.ts`).

## Conventions

- Shared package must be built before the server (`dev:server` / `build:server` do it).
- `dist/content.js` and `dist/player-bridge.js` must stay classic scripts; `scripts/check-dist.mjs` enforces this, forbids new manifest permissions (Chrome would disable the extension on update) and forbids `chrome.tabs.update(..., { active: true })`.
- UI uses the design tokens in `src/index.css` / `tailwind.config.js` only; `src/uiRules.test.ts` fails on arbitrary text sizes, gradients, coloured glows, raw hex colours.
- Tests first (Vitest). Server tests are real Socket.IO integration tests with an injectable clock (`apps/server/test/helpers.ts`).

## Environment Variables (server)

- `PORT` — default 3005 (3001 in Docker)
- `GIPHY_API_KEY` — enables `GET /gifs`; without it the GIF button is hidden
- `ALLOWED_ORIGINS` — extra CORS origins (comma separated); `chrome-extension://*` and localhost are always allowed
- `TRUST_PROXY` — `1` when a reverse proxy is in front (Render): per-IP limits then use the last `X-Forwarded-For` entry; otherwise the socket address

Extension build: `VITE_SERVER_URL` sets the server it talks to (default: the production server, `https://watch-pizza-party.onrender.com`). Release process: `DEPLOYMENT_GUIDE.md`.
