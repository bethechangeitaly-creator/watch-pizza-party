# Watch Pizza Party 2.0 — Design

Source: the code review of v1.2 (2026-11-11). This document turns that review into decisions.

## Goals

1. Close the security holes found in v1.2 (room hijack by display name, arbitrary tab redirects, unbounded input, client-controlled sequence numbers, leaked Giphy key, arbitrary image URLs in chat).
2. Fix the reliability bugs (no chat history for late joiners, ghost participants, server memory leaks, host role lost on a network blip, implicit tab hijacking, focus-stealing volume boost, always-on content-script polling).
3. Replace the heuristic sync engine with clock sync + a rate/seek controller that is small and unit-tested.
4. Redesign the UI so it no longer reads as generated: one accent, a real type scale, chat-first room view.
5. Have tests: unit + server integration (Vitest) and one real-browser end-to-end sync test (Playwright, YouTube).

Scope stays YouTube + Netflix. Generic `<video>` sites are a later project.

## Decisions

### D1. Protocol version 2, hard cut, no backward compatibility
- Every client message to the server is validated by `ClientMessageSchema` (Zod); every server message by `ServerMessageSchema`.
- `POST /rooms` and `room.join` require `protocolVersion: 2`. Anything else gets code `update_required` and the message:
  `Watch Pizza Party was updated. Update the extension (chrome://extensions → Update) and try again.`
- Rollout: the v2 server is deployed as a **new** service URL; the v1 server stays up untouched until store users have auto-updated, then is deleted. The extension reads the URL from `VITE_SERVER_URL` at build time.
- The extension must **not add** manifest permissions or host permissions (Chrome disables an extension on update when new permission warnings appear). The server allows `chrome-extension://*` origins via CORS, so no host permission is needed for the new URL.

### D2. Identity = server-issued token, never the display name
- `POST /rooms` returns `{ roomId, userId, token, username, avatarColor }` for the creator.
- `room.join { roomId, token?, username?, protocolVersion: 2 }`: a valid token for that room resumes the same user; otherwise a **new** user is created with a fresh 24-char token. Names are display-only and made unique per room (`Marco`, `Marco 2`).
- Tokens live server-side only; `room.state` never contains them. The client stores `{ roomId, token, username, mediaTabId, savedAt }` in `chrome.storage.local` (8 h max age).
- Max 20 participants per room.

### D3. Presence with a grace period
- A member stays in the room for **30 s** after their last socket disconnects (status `reconnecting`). Resuming within the grace keeps id, name, colour and host role.
- After the grace the member is removed; if they were host, the earliest-joined *connected* member becomes host.
- A room with no members is deleted **30 min** later. All per-room state (members, chat, timeline, viewer status) lives in one record and is deleted together.
- A socket that joins a second room is removed from the first immediately. `room.leave` removes immediately.

### D4. Limits
- Socket.IO `maxHttpBufferSize` = 16 KiB.
- Max lengths: chat 500, username 32, title 300, roomId 32, token 64.
- Per-socket token buckets `[capacity, refill/s]`: chat [5, 1], hostUpdate [20, 10], viewerStatus [4, 1], request [3, 0.5], join [5, 0.1], time [10, 2].
- Per-IP: room creation 10/min, joins 30/min, GIF search 30/min.
- Errors carry a code: `update_required | room_not_found | room_full | rate_limited | invalid_message | not_host`.

### D5. Sync model
- **Clock sync:** client calls `socket.emit('time', ack)`; server acks `Date.now()`. Offset = `server − (t0 + t3)/2`, taken from the min-RTT sample of the last 8. 5 samples at connect (150 ms apart), then one every 15 s.
- **Timeline** (server-owned, broadcast as `sync.timeline`):
  `{ rev, platform, mediaId, title?, positionSec, anchorServerMs, rate, paused, inAd, cause, updatedBy? }`.
  `rev` is assigned by the server (+1 per update). The client never sends a URL — viewers navigate to `canonicalWatchUrl(platform, mediaId)` built from a regex-validated id (YouTube `^[A-Za-z0-9_-]{11}$`, Netflix `^\d{1,12}$`).
- **Host** samples its player every 250 ms and sends `sync.host_update` when something changes (`initial | media | play | pause | seek | rate | ad`) plus a `heartbeat` every 5 s while playing. Only pages with a media id (YouTube `/watch?v=`, `youtu.be/`, Netflix `/watch/<id>`) produce updates; browsing YouTube home moves no one. The server clamps `atServerMs` into `[now − 5000, now + 1000]`.
- **Viewer** runs the controller in the content script every 250 ms against `expected = positionSec + (serverNow − anchorServerMs)/1000 × rate` (frozen when `paused || inAd`).
- **Controller** (`decideCorrection`), profiles:

  | | YouTube | Netflix |
  |---|---|---|
  | seek threshold | 1.0 s | 1.5 s |
  | seek cooldown | 1500 ms | 4000 ms |
  | seek lead | 0.1 s | 0.3 s |
  | deadband | 0.08 s | 0.4 s |
  | rate nudge | yes, max ±5 %, converge over 4 s | no |

  Rules: own ad → do nothing (`ad`); buffering → do nothing; |drift| > threshold (0.25 s when target paused; deadband when `force`) and cooldown elapsed (or `force`) → seek to target (+lead when playing); then match play/pause; when playing and no seek: deadband < |drift| ≤ threshold → `rate = target.rate × (1 − clamp(drift/4, −0.05, 0.05))` rounded to 3 decimals; otherwise restore `target.rate`. State: `paused` if target paused, else `synced` if |drift| ≤ max(deadband, 0.3), else `drifting`.
- Removed: sync-aggression slider, sync-profile picker, telemetry ring buffer, ~40 module-level timing variables, the duplicate `executeScript` Netflix path, the `<script>` re-injection of the player bridge.

### D6. Extension structure
- `src/background/` (index, connection, session controller, persisted session, media tab, volume), `src/content/` (index, bridge, adapters, host reporter, viewer follower, bubble), `src/panel/` (React app), `src/lib/messages.ts` (typed contract).
- Content script runs in the top frame only and does **nothing** (no timers) until the background activates it for the bound media tab.
- The media tab is bound explicitly: the tab you start/join from, or "Use this tab". Never "whatever tab is active". Closing it unbinds it; nothing else is navigated.
- Popup removed: clicking the toolbar icon opens the side panel.
- The floating bubble renders in an open Shadow DOM, only in the media tab, pushed by the background (no polling).
- Volume boost: 100–300 %, started only from a slider gesture in the panel (panel calls `chrome.tabCapture.getMediaStreamId`), limiter after gain, never on panel open, never activates a tab, resets on tab change, not persisted.
- Chat history: server sends the last 100 messages on every join (`chat.history`); background caches the panel timeline (chat + system, 200 entries) in `chrome.storage.session`.
- GIFs: the server proxies Giphy (`GET /gifs?q=`) with the key from `GIPHY_API_KEY`, 10-minute cache (200 entries); the extension ships no key. Chat renders an image only when the whole message is a URL on `i.giphy.com` or `media<N>.giphy.com` over https.

### D7. Visual design
- **Tokens** (RGB triplets in CSS variables, theme via `data-theme` = `light | dark`, default follows the system):

  | token | dark | light |
  |---|---|---|
  | bg | 11 11 12 | 250 250 249 |
  | surface | 20 20 22 | 255 255 255 |
  | surface-2 | 28 28 31 | 242 242 240 |
  | line | 255 255 255 / 6 % | 0 0 0 / 8 % |
  | text | 237 237 239 | 24 24 27 |
  | muted | 139 139 147 | 107 107 115 |
  | accent | 255 106 61 | 229 83 42 |
  | accent-fg | 26 10 4 | 26 10 4 |
  | success | 61 214 140 | 22 163 94 |
  | warning | 245 184 61 | 180 120 10 |
  | danger | 255 92 92 | 220 38 38 |

- **Type:** meta 12/16, body 13/18, title 15/20, display 20/26 (px). Weights 400/500/600 only. System UI font stack. Uppercase only for nothing — no tracking-widest labels.
- **Shape:** controls radius 10 px, sheets 14 px, avatars round. No borders on cards; elevation is background (`bg` → `surface` → `surface-2`). At most one hairline (`line`). No gradients, no coloured glows, no scale-on-hover, no emoji in UI chrome.
- **Targets:** buttons 36 px tall (small 30 px), icon buttons 32 px.
- **Avatar palette** (name → hex): Tomato #FF6A3D, Saffron #F5B83D, Basil #3DD68C, Sky #3DB8F5, Plum #8B7CF6, Rose #F06BB0, Chili #E0533D, Teal #2FB5A3, Crust #C08A5B, Slate #7A8CA3. Names are `"<Colour> <Ingredient>"` with a space (e.g. `Basil Burrata`).
- **Landing:** header (logo, name, ⋯ About) → display line "Watch together, in sync." + one body line → "You'll join as <name> ↻" → primary **Start a party** (disabled with hint "Open a YouTube or Netflix video first" when the current tab has no media id; shows "Using: <title>" otherwise) → "or join a friend" → code field + **Join** → "Advanced" disclosure with the server URL. Cold start shows "Waking up the server — this can take up to a minute on the first party of the day." and retries automatically for up to 75 s.
- **Room:** 48 px header (room code chip → copies, avatar stack → People sheet, ⋯ → Menu sheet) → one status line (dot + text + optional action) → now-playing line → chat (fills) → composer. Menu sheet: Invite, Sync, Volume boost, Appearance (theme, chat sounds), Support, About & guide, Minimize to bubble, Leave party. The donation prompt is a single chat entry at most once per 7 days after 30 minutes in a party.
- **Status line copy:** host → "You're the host"; viewer → "In sync" / "Catching up…" / "Waiting for the host's ad" / "You're in an ad" / "Buffering…" / "Paused"; any → "Reconnecting…"; no media tab → "Pick a tab to watch in" + **Use this tab**; host with any drifting viewer → action **Sync everyone**; drifting viewer → action **Resync**.

### D8. Ops
- Server Docker image on `node:24-slim`, `npm ci` with the existing `package-lock.json` (the v1 Dockerfile used pnpm without a lockfile and could not build).
- Server env: `PORT`, `GIPHY_API_KEY`, optional `ALLOWED_ORIGINS` (comma list, added to `chrome-extension://*` and localhost).
- Version 2.0.0 everywhere.
