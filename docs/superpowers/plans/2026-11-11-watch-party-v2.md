# Watch Pizza Party 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v2.0.0 of the extension and server: token identity, input limits, presence with grace, clock-synced timeline sync, chat history, a redesigned chat-first UI, and tests.

**Architecture:** Shared pure logic (protocol schemas, media ids, names, clock sync, sync controller) lives in `packages/shared` and is unit-tested. The server is rebuilt around a `RoomStore` that owns all per-room state, wrapped by a Socket.IO handler with token buckets. The extension is split into `background/`, `content/`, `panel/` modules talking through one typed message contract; the viewer runs the controller inside the content script.

**Tech Stack:** TypeScript 5 strict, Zod 3, Express 4 + Socket.IO 4, React 18 + Tailwind 3 + Vite 5, Vitest 3 (+ jsdom, @testing-library/react), Playwright for E2E, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-11-watch-party-v2-design.md` (decisions D1–D8; this plan cites them).

## Global Constraints

- Protocol version is `2`. No backward compatibility; legacy clients get code `update_required` with the exact message from D1.
- Do not add any `permissions` or `host_permissions` to the manifest. Removing is allowed.
- `dist/content.js` and `dist/player-bridge.js` are classic scripts (no top-level `import`/`export`). `dist/` contains no `.ts` files.
- The server never trusts client-supplied ids, revisions, sequence numbers or URLs. Viewers navigate only to `canonicalWatchUrl(...)`.
- Never call `chrome.tabs.update` with `active: true`. After a session starts, never pick "the active tab" implicitly.
- Chat renders images only for `isAllowedGifUrl(...)` URLs.
- UI: no text under 12 px, no arbitrary `text-[Npx]` classes, colours only through the D7 tokens, no gradients or coloured glow shadows.
- Every task ends with `npm test` green at the repo root. From Task 13 on, `npm run build:extension` is also green. (The panel only works at runtime again after Task 23 — the branch is not releasable before that.)
- Work on branch `v2-overhaul`. Stage paths explicitly (the working tree has an unrelated deleted zip and an untracked `watch-pizza-party-v1.2/` that must not be committed). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Host's service worker restarts or Wi-Fi drops for under 30 s** → host keeps the host role, viewers keep playing. Pinned in Task 7 (`host resumes within grace`) and Task 15 (`persists the token from room.joined and resumes with it after restart`).
2. **Two friends type the same name** → two people, `Marco` and `Marco 2`, each sees their own messages as their own. Pinned in Task 6 and Task 24 (`groups by userId, not name`).
3. **Viewer closes the video tab, or opens the panel while on another tab** → no other tab is navigated. Pinned in Task 16 (`no media tab → none`).
4. **Host browses YouTube home/search between videos** → viewers stay where they are. Pinned in Task 1 (`extractMedia` null cases) and Task 17 (`host reporter is silent without a media id`).
5. **A viewer (or the host) gets an ad** → no fighting during the ad, catch-up after. Pinned in Task 4 (`own ad → no actions`, `host ad → treated as paused`) and Task 17 (follower test).

---

## Part A — Shared core (`packages/shared`)

### Task 1: Test tooling, media ids and names

**Files:**
- Modify: `package.json` (root `test` script → `npm test --workspaces --if-present`), `packages/shared/package.json` (devDeps `vitest@^3.2.4`; script `"test": "vitest run"`; version `2.0.0`)
- Create: `packages/shared/src/media.ts`, `packages/shared/src/names.ts`
- Test: `packages/shared/src/media.test.ts`, `packages/shared/src/names.test.ts`
- Modify: `packages/shared/src/index.ts` (export the new modules; keep the legacy `schemas.ts` exports until Task 23), `packages/shared/tsconfig.json` (`"exclude": ["src/**/*.test.ts"]`)

**Interfaces:**
- Produces:
  - `type SupportedPlatform = 'youtube' | 'netflix'`
  - `type MediaRef = { platform: SupportedPlatform; mediaId: string }`
  - `extractMedia(url: string): MediaRef | null`
  - `isValidMediaRef(ref: MediaRef): boolean`
  - `canonicalWatchUrl(ref: MediaRef): string` (throws `Error('invalid media ref')` when invalid)
  - `isAllowedGifUrl(url: string): boolean`
  - `AVATAR_PALETTE: ReadonlyArray<{ name: string; hex: string }>` (D7, in D7 order)
  - `generateRandomName(rand?: () => number): { name: string; color: string }`
  - `sanitizeUsername(raw: unknown): string | null`, `USERNAME_MAX = 32`
  - `uniqueDisplayName(desired: string, taken: readonly string[]): string`

- [ ] **Step 1: Create the branch**

Run: `git checkout -b v2-overhaul && git status --short`
Expected: on `v2-overhaul`; status still shows ` D watch-pizza-party-v1.0.2.zip` and `?? watch-pizza-party-v1.2/` (leave both alone).

- [ ] **Step 2: Write the failing tests**

```ts
// media.test.ts
const YT = 'dQw4w9WgXcQ';
it.each([
  [`https://www.youtube.com/watch?v=${YT}&t=42s`, { platform: 'youtube', mediaId: YT }],
  [`https://m.youtube.com/watch?v=${YT}`, { platform: 'youtube', mediaId: YT }],
  [`https://youtu.be/${YT}?si=abc`, { platform: 'youtube', mediaId: YT }],
  ['https://www.netflix.com/watch/80100172?trackId=1', { platform: 'netflix', mediaId: '80100172' }],
])('extractMedia(%s)', (url, ref) => expect(extractMedia(url)).toEqual(ref));
it.each([
  'https://www.youtube.com/', 'https://www.youtube.com/results?search_query=x',
  `https://www.youtube.com/shorts/${YT}`, 'https://www.netflix.com/browse',
  `https://evil.com/watch?v=${YT}`, `https://youtube.com.evil.com/watch?v=${YT}`,
  'https://www.youtube.com/watch?v=short', 'javascript:alert(1)', '',
])('extractMedia(%s) is null', (url) => expect(extractMedia(url)).toBeNull());
it('builds canonical urls', () => {
  expect(canonicalWatchUrl({ platform: 'youtube', mediaId: YT })).toBe(`https://www.youtube.com/watch?v=${YT}`);
  expect(canonicalWatchUrl({ platform: 'netflix', mediaId: '80100172' })).toBe('https://www.netflix.com/watch/80100172');
  expect(() => canonicalWatchUrl({ platform: 'netflix', mediaId: '../x' })).toThrow('invalid media ref');
});
it('allows only https giphy cdn gifs', () => {
  expect(isAllowedGifUrl('https://media2.giphy.com/media/abc/giphy.gif')).toBe(true);
  expect(isAllowedGifUrl('https://i.giphy.com/abc.gif')).toBe(true);
  expect(isAllowedGifUrl('http://media.giphy.com/a.gif')).toBe(false);
  expect(isAllowedGifUrl('https://evil.com/a.gif')).toBe(false);
  expect(isAllowedGifUrl('https://media.giphy.com.evil.com/a.gif')).toBe(false);
});

// names.test.ts
it('sanitizes', () => {
  expect(sanitizeUsername('  Marco\u0000  Rossi ')).toBe('Marco Rossi');
  expect(sanitizeUsername('x'.repeat(40))).toHaveLength(32);
  expect(sanitizeUsername('   ')).toBeNull();
  expect(sanitizeUsername(42)).toBeNull();
});
it('dedupes display names case-insensitively', () => {
  expect(uniqueDisplayName('Marco', ['marco'])).toBe('Marco 2');
  expect(uniqueDisplayName('Marco', ['Marco', 'Marco 2'])).toBe('Marco 3');
  expect(uniqueDisplayName('Luca', ['Marco'])).toBe('Luca');
  expect(uniqueDisplayName('x'.repeat(32), ['x'.repeat(32)]).length).toBeLessThanOrEqual(32);
});
it('generates "<Colour> <Ingredient>" with the palette colour', () => {
  const { name, color } = generateRandomName(() => 0);
  expect(name).toBe(`${AVATAR_PALETTE[0].name} Pepperoni`);
  expect(color).toBe(AVATAR_PALETTE[0].hex);
});
```

- [ ] **Step 3: Install and run to verify failure**

Run: `npm install && npm test --workspace=@watch-party/shared`
Expected: FAIL — modules `./media` and `./names` not found.

- [ ] **Step 4: Implement `media.ts` and `names.ts`**

Host matching is exact (`youtube.com` or a `.youtube.com` subdomain, `youtu.be`, `netflix.com` or `.netflix.com`) and protocol must be `https:`. Ids are validated with `^[A-Za-z0-9_-]{11}$` (YouTube) and `^\d{1,12}$` (Netflix). GIF hosts: `i.giphy.com` or `/^media\d*\.giphy\.com$/`. Keep the existing 20-ingredient list; colours come from `AVATAR_PALETTE`. `uniqueDisplayName` truncates the base so `"<base> <n>"` fits in 32.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: shared tests PASS; root command exits 0 (server and extension have no `test` script yet and are skipped).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/shared
git commit -m "feat(shared): media ids, canonical urls, gif allowlist, names"
```

### Task 2: Protocol v2 schemas

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `isValidMediaRef`, `USERNAME_MAX` (Task 1)
- Produces (all exported, schemas plus `z.infer` types of the same name without `Schema`):
  - `PROTOCOL_VERSION = 2`, `UPDATE_REQUIRED_MESSAGE` (exact text from D1), `TIME_EVENT = 'time'`, `MESSAGE_EVENT = 'message'`
  - `LIMITS = { chatMax: 500, usernameMax: 32, titleMax: 300, roomIdMax: 32, tokenMax: 64, maxParticipants: 20, historySize: 100 }`
  - `ViewerSyncStateSchema = z.enum(['synced','drifting','buffering','ad','paused'])`
  - `UserStatusSchema = z.enum(['synced','drifting','buffering','ad','paused','reconnecting','unknown'])`
  - `UserSchema { id, username, avatarColor, role: 'host'|'viewer', joinedAt, status: UserStatus }`
  - `HostUpdateCauseSchema = z.enum(['initial','media','play','pause','seek','rate','ad','heartbeat'])`; `TimelineCauseSchema` = those plus `'force'`
  - `TimelineSchema { rev: int ≥ 0, platform: 'youtube'|'netflix', mediaId, title?: ≤300, positionSec ≥ 0, anchorServerMs, rate ∈ [0.25, 4], paused, inAd, cause: TimelineCause, updatedBy?: string }` with `.refine(isValidMediaRef)`
  - `RoomSchema { id, hostId, participants: User[], timeline: Timeline | null }`
  - `ChatMessageSchema { id, userId, username, avatarColor, text: 1..500, timestamp }`
  - `SystemEventSchema { kind: z.enum(['join','leave','host_change','play','pause','seek','media','request','force']), text, userId?, username?, timestamp }`
  - `SyncRequestReasonSchema = z.enum(['resync','pause','play','back','forward'])`
  - `ErrorCodeSchema = z.enum(['update_required','room_not_found','room_full','rate_limited','invalid_message','not_host'])`
  - `HostUpdateSchema { platform, mediaId, title?, positionSec ≥ 0, atServerMs, rate ∈ [0.25, 4], paused, inAd, cause: HostUpdateCause }` with the same refine
  - `ClientMessageSchema` = discriminated union on `type`: `room.join {roomId ≤32, token? ≤64, username? ≤ 64 (sanitized server-side), protocolVersion: z.literal(2)}`, `room.leave {}`, `chat.send {text: trimmed 1..500}`, `sync.host_update HostUpdate`, `sync.viewer_status {rev, driftSec, state: ViewerSyncState}`, `sync.request {reason}`, `sync.force {}`
  - `ServerMessageSchema` = discriminated union: `room.joined {roomId, userId, token, username, avatarColor, resumed}`, `room.state Room`, `chat.message ChatMessage`, `chat.history {messages: ChatMessage[]}`, `sync.timeline Timeline`, `sync.request {reason, userId, username}`, `system.event SystemEvent`, `error {code, message}`
  - `CreateRoomRequestSchema { protocolVersion: z.literal(2), username?: string ≤ 64 }`, `CreateRoomResponseSchema { roomId, userId, token, username, avatarColor }`

- [ ] **Step 1: Write the failing tests**

```ts
it('rejects join without protocolVersion 2', () => {
  expect(ClientMessageSchema.safeParse({ type: 'room.join', payload: { roomId: 'abc' } }).success).toBe(false);
  expect(ClientMessageSchema.safeParse({ type: 'room.join', payload: { roomId: 'abc', protocolVersion: 2 } }).success).toBe(true);
});
it('caps chat length and trims', () => {
  expect(ClientMessageSchema.safeParse({ type: 'chat.send', payload: { text: 'a'.repeat(501) } }).success).toBe(false);
  expect(ClientMessageSchema.safeParse({ type: 'chat.send', payload: { text: '   ' } }).success).toBe(false);
});
it('host_update has no url/seq fields and validates media ids', () => {
  const base = { platform: 'youtube', mediaId: 'dQw4w9WgXcQ', positionSec: 1, atServerMs: 1, rate: 1, paused: false, inAd: false, cause: 'play' };
  expect(HostUpdateSchema.safeParse(base).success).toBe(true);
  expect(HostUpdateSchema.safeParse({ ...base, mediaId: '../../x' }).success).toBe(false);
  expect(HostUpdateSchema.parse({ ...base, url: 'https://evil.com', seq: 9 })).not.toHaveProperty('url');
});
it('rejects rate outside [0.25, 4]', () => { /* rate 0 and 10 fail */ });
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace=@watch-party/shared` → FAIL, `./protocol` not found.
- [ ] **Step 3: Implement `protocol.ts`** with the shapes above. Use `z.object(...)` (strip mode) everywhere so unknown client fields are dropped.
- [ ] **Step 4: Run tests** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): protocol v2 schemas"`

### Task 3: Clock sync

**Files:**
- Create: `packages/shared/src/sync/clock.ts`
- Test: `packages/shared/src/sync/clock.test.ts`

**Interfaces:**
- Produces: `class ClockSync { constructor(maxSamples = 8); addSample(sentAtLocalMs: number, serverMs: number, receivedAtLocalMs: number): void; get offsetMs(): number | null; get rttMs(): number | null; get sampleCount(): number; toServerTime(localMs: number): number }`

- [ ] **Step 1: Write the failing tests**

```ts
it('computes offset from one sample', () => {
  const c = new ClockSync(); c.addSample(1000, 5050, 1100);
  expect(c.offsetMs).toBe(4000); expect(c.rttMs).toBe(100);
  expect(c.toServerTime(2000)).toBe(6000);
});
it('uses the min-RTT sample', () => {
  const c = new ClockSync(); c.addSample(0, 4100, 400); c.addSample(1000, 5030, 1040);
  expect(c.offsetMs).toBe(4010); expect(c.rttMs).toBe(40);
});
it('keeps only the last N samples', () => {
  const c = new ClockSync(2); c.addSample(0, 4010, 20); c.addSample(100, 9200, 400); c.addSample(500, 9800, 900);
  expect(c.sampleCount).toBe(2); expect(c.rttMs).toBe(300);
});
it('ignores negative RTT and has null offset with no samples', () => {
  const c = new ClockSync(); expect(c.offsetMs).toBeNull(); expect(c.toServerTime(5)).toBe(5);
  c.addSample(100, 0, 50); expect(c.sampleCount).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module not found.
- [ ] **Step 3: Implement** — offset of a sample = `serverMs − (sent + received) / 2`.
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): clock sync estimator"`

### Task 4: Timeline maths and the sync controller

**Files:**
- Create: `packages/shared/src/sync/timeline.ts`, `packages/shared/src/sync/controller.ts`
- Test: `packages/shared/src/sync/timeline.test.ts`, `packages/shared/src/sync/controller.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `Timeline`, `ViewerSyncState` (Task 2), `SupportedPlatform` (Task 1)
- Produces:
  - `expectedPositionSec(t: Timeline, serverNowMs: number): number`, `isTimelinePaused(t: Timeline): boolean`
  - `type SyncProfile = { seekThresholdSec: number; seekCooldownMs: number; seekLeadSec: number; deadbandSec: number; rateNudge: boolean; maxRateAdjust: number; convergeSec: number }`
  - `SYNC_PROFILES: Record<SupportedPlatform, SyncProfile>` (values from D5)
  - `type PlayerSnapshot = { positionSec: number; paused: boolean; rate: number; buffering: boolean; inAd: boolean }`
  - `type SyncTarget = { positionSec: number; paused: boolean; rate: number }`
  - `type SyncAction = { type: 'play' } | { type: 'pause' } | { type: 'seek'; toSec: number } | { type: 'rate'; rate: number }`
  - `type Decision = { driftSec: number; state: ViewerSyncState; actions: SyncAction[] }`
  - `decideCorrection(input: { target: SyncTarget; player: PlayerSnapshot; profile: SyncProfile; nowMs: number; lastSeekAtMs: number; force: boolean }): Decision`

- [ ] **Step 1: Write the failing tests**

```ts
// timeline.test.ts — t = { positionSec: 10, anchorServerMs: 1000, rate: 1, paused: false, inAd: false, ... }
expect(expectedPositionSec(t, 3500)).toBe(12.5);
expect(expectedPositionSec({ ...t, rate: 1.5 }, 3500)).toBe(13.75);
expect(expectedPositionSec({ ...t, paused: true }, 9000)).toBe(10);
expect(expectedPositionSec({ ...t, inAd: true }, 9000)).toBe(10);
expect(expectedPositionSec(t, 500)).toBe(10); // never runs backwards

// controller.test.ts
const YT = SYNC_PROFILES.youtube, NF = SYNC_PROFILES.netflix;
const play = (positionSec: number, over: Partial<PlayerSnapshot> = {}) =>
  ({ positionSec, paused: false, rate: 1, buffering: false, inAd: false, ...over });
const run = (target: Partial<SyncTarget>, player: PlayerSnapshot, o: { profile?: SyncProfile; lastSeekAtMs?: number; force?: boolean } = {}) =>
  decideCorrection({ target: { positionSec: 100, paused: false, rate: 1, ...target }, player,
    profile: o.profile ?? YT, nowMs: 10_000, lastSeekAtMs: o.lastSeekAtMs ?? 0, force: o.force ?? false });

it('in sync → nothing', () => expect(run({}, play(100.03))).toMatchObject({ state: 'synced', actions: [] }));
it('ahead 0.4s → slow down, capped at 5%', () => expect(run({}, play(100.4)).actions).toEqual([{ type: 'rate', rate: 0.95 }]));
it('behind 0.12s → speed up 3%', () => expect(run({}, play(99.88)).actions).toEqual([{ type: 'rate', rate: 1.03 }]));
it('3s behind → seek with lead', () => expect(run({}, play(97)).actions).toEqual([{ type: 'seek', toSec: 100.1 }]));
it('3s behind inside cooldown → wait', () => expect(run({}, play(97), { lastSeekAtMs: 9_000 }).actions).toEqual([]));
it('netflix 1s off → no nudge, drifting', () => expect(run({}, play(101), { profile: NF })).toMatchObject({ state: 'drifting', actions: [] }));
it('netflix 2s off → seek with 0.3 lead', () => expect(run({}, play(98), { profile: NF }).actions).toEqual([{ type: 'seek', toSec: 100.3 }]));
it('target paused, player playing → pause', () => expect(run({ paused: true }, play(100.1)).actions).toEqual([{ type: 'pause' }]));
it('target paused 0.5s off → exact seek then pause', () => expect(run({ paused: true }, play(100.5)).actions).toEqual([{ type: 'seek', toSec: 100 }, { type: 'pause' }]));
it('target playing, player paused → play', () => expect(run({}, play(100.05, { paused: true })).actions).toEqual([{ type: 'play' }]));
it('own ad → no actions', () => expect(run({}, play(50, { inAd: true }))).toMatchObject({ state: 'ad', actions: [] }));
it('buffering → no actions', () => expect(run({}, play(90, { buffering: true }))).toMatchObject({ state: 'buffering', actions: [] }));
it('force bypasses cooldown with deadband threshold', () =>
  expect(run({}, play(99.8), { lastSeekAtMs: 9_900, force: true }).actions).toEqual([{ type: 'seek', toSec: 100.1 }]));
it('restores rate after converging', () => expect(run({}, play(100.05, { rate: 0.95 })).actions).toEqual([{ type: 'rate', rate: 1 }]));
it('follows host rate', () => expect(run({ rate: 1.5 }, play(100)).actions).toEqual([{ type: 'rate', rate: 1.5 }]));
```

"Host in an ad → treated as paused" is pinned where the target is built (Task 17), via `isTimelinePaused`; add here: `expect(isTimelinePaused({ ...t, inAd: true })).toBe(true)`.

- [ ] **Step 2: Run to verify failure** — FAIL, modules not found.
- [ ] **Step 3: Implement** both modules following the D5 rules in order (ad → buffering → seek → play/pause → rate → state). `driftSec = player.positionSec − target.positionSec`; rate rounded with `Math.round(x * 1000) / 1000`.
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): timeline maths and sync controller"`

---
## Part B — Server (`apps/server`)

All server tests are integration tests against a real Socket.IO server on port 0, with an injectable clock. Tests import `@watch-party/shared` from source via a Vitest alias, so they don't need a shared build.

### Task 5: App factory and test harness

**Files:**
- Create: `apps/server/src/app.ts`, `apps/server/vitest.config.ts`, `apps/server/test/helpers.ts`
- Test: `apps/server/test/app.test.ts`
- Modify: `apps/server/src/index.ts` (only `createApp(...)` + `listen`), `apps/server/package.json` (move `@types/*` and `typescript` to devDependencies; add devDeps `vitest@^3.2.4`, `socket.io-client@^4.7.4`; scripts `"test": "vitest run"`; `"engines": { "node": ">=22" }`; version `2.0.0`), `apps/server/tsconfig.json` (`"exclude": ["test", "**/*.test.ts"]`)

**Interfaces:**
- Produces:
  - `type AppOptions = { now?: () => number; giphyApiKey?: string; sweepIntervalMs?: number; fetchImpl?: typeof fetch }`
  - `createApp(opts?: AppOptions): { httpServer: http.Server; io: Server; store: RoomStore; runSweep(): void; close(): Promise<void> }` — `sweepIntervalMs: 0` disables the timer (tests call `runSweep()`); default 5000. In this task `store` is the existing `RoomManager` (typed as such) and `runSweep()` calls its `cleanupRooms()`; Task 6 swaps in `RoomStore`.
  - `GET /health` → `200 { ok: true }`. `GET /` and `GET /rooms/:id`, `/focus-test`, `/focus-test-frame` and the 30 s "Server alive" log are deleted.
  - Test helpers in `test/helpers.ts`:
    - `startTestServer(opts?: AppOptions): Promise<{ url: string; app: ReturnType<typeof createApp>; close(): Promise<void> }>`
    - `postRoom(url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any }>`
    - `connectClient(url: string): Promise<TestClient>` where `TestClient = { socket; received: ServerMessage[]; send(msg: unknown): void; waitFor<T extends ServerMessage['type']>(type: T, pred?: (p: Extract<ServerMessage, {type: T}>['payload']) => boolean, timeoutMs?: number): Promise<Extract<ServerMessage, {type: T}>['payload']>; expectNone(type: ServerMessage['type'], ms?: number): Promise<void>; time(): Promise<number>; close(): void }`
    - `join(client: TestClient, roomId: string, extra?: { token?: string; username?: string }): Promise<RoomJoined>` (sends `protocolVersion: 2`, waits for `room.joined`)
    - `fakeClock(start = 1_700_000_000_000): { now: () => number; advance(ms: number): void }`

The old `roomManager.ts` and `wsHandler.ts` stay wired in this task and are deleted in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
it('serves /health', async () => {
  const s = await startTestServer();
  const res = await fetch(`${s.url}/health`);
  expect(res.status).toBe(200); expect(await res.json()).toEqual({ ok: true });
  await s.close();
});
it('accepts a websocket connection', async () => {
  const s = await startTestServer(); const c = await connectClient(s.url);
  expect(c.socket.connected).toBe(true); c.close(); await s.close();
});
```

- [ ] **Step 2: Run to verify failure** — `npm install && npm test --workspace=@watch-party/server` → FAIL, `../src/app` not found.
- [ ] **Step 3: Implement `createApp`** and slim `index.ts` to `createApp({ giphyApiKey: process.env.GIPHY_API_KEY }).httpServer.listen(Number(process.env.PORT || 3005), '0.0.0.0')`. Keep the existing `setupWS(io, roomManager)` wiring for now so the app still runs.
- [ ] **Step 4: Run tests** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git add apps/server package-lock.json && git commit -m "test(server): app factory and integration harness"`

### Task 6: RoomStore identity, tokens and the protocol gate

**Files:**
- Create: `apps/server/src/roomStore.ts` (replaces placeholder), `apps/server/src/socketHandlers.ts`
- Delete: `apps/server/src/roomManager.ts`, `apps/server/src/wsHandler.ts`
- Modify: `apps/server/src/app.ts` (POST `/rooms`, wire `setupSocketHandlers`)
- Test: `apps/server/test/identity.test.ts`

**Interfaces:**
- Consumes: protocol schemas (Task 2), `generateRandomName`, `sanitizeUsername`, `uniqueDisplayName` (Task 1)
- Produces:
  - `DISCONNECT_GRACE_MS = 30_000`, `ROOM_TTL_MS = 30 * 60_000`
  - `type Credentials = { roomId: string; userId: string; token: string; username: string; avatarColor: string }`
  - `type JoinOutcome = ({ ok: true; resumed: boolean } & Credentials) | { ok: false; code: 'room_not_found' | 'room_full' }`
  - `class RoomStore { constructor(now?: () => number); createRoom(username?: string | null): Credentials; join(roomId: string, opts: { token?: string | null; username?: string | null }): JoinOutcome; getPublicRoom(roomId: string): Room | null; isHost(roomId: string, userId: string): boolean; hasRoom(roomId: string): boolean }` (presence, chat and sync methods arrive in Tasks 7, 9, 10)
  - `setupSocketHandlers(io: Server, store: RoomStore, deps: { now: () => number }): void`
  - Internals (not exported): one `RoomRecord` per room holding `members: Map<userId, Member>` where `Member = { user: User; token: string; sockets: number; leftAt: number | null }`, plus `tokens: Map<token, userId>`. Room ids `nanoid(10)`, user ids `nanoid(8)`, tokens `nanoid(24)`. The creator is a member with `role: 'host'`, `sockets: 0`, `leftAt: createdAt`, `status: 'reconnecting'` until they join.
- Socket handler behaviour in this task: on `message`, if `raw?.type === 'room.join' && raw?.payload?.protocolVersion !== 2` → emit `error { code: 'update_required', message: UPDATE_REQUIRED_MESSAGE }`. Otherwise parse `ClientMessageSchema`; on failure emit `error { code: 'invalid_message', message: 'Invalid message.' }`. `room.join` → `store.join`; failure → `error { code, message }` with messages `Room not found. Check the code.` / `This room is full (20 people).`; success → `socket.join(roomId)`, emit `room.joined` to the socket, then `room.state` to the room.
- `POST /rooms`: body must parse `CreateRoomRequestSchema`; missing/other `protocolVersion` → `426 { code: 'update_required', error: UPDATE_REQUIRED_MESSAGE }`; success → `200 CreateRoomResponse`.

- [ ] **Step 1: Write the failing tests**

```ts
it('POST /rooms without protocolVersion → 426', async () => {
  const r = await postRoom(s.url, { hostUsername: 'Marco' });
  expect(r.status).toBe(426); expect(r.body).toEqual({ code: 'update_required', error: UPDATE_REQUIRED_MESSAGE });
});
it('legacy room.join → update_required', async () => {
  c.send({ type: 'room.join', payload: { roomId: 'x', username: 'a' } });
  expect(await c.waitFor('error')).toEqual({ code: 'update_required', message: UPDATE_REQUIRED_MESSAGE });
});
it('creator resumes with token and is host', async () => {
  const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
  const joined = await join(c, room.roomId, { token: room.token });
  expect(joined).toMatchObject({ userId: room.userId, resumed: true, username: 'Marco' });
  expect((await c.waitFor('room.state')).hostId).toBe(room.userId);
});
it('same name without token = new viewer "Marco 2" (hijack regression)', async () => {
  const room = (await postRoom(s.url, { protocolVersion: 2, username: 'Marco' })).body;
  await join(host, room.roomId, { token: room.token });
  const imp = await join(other, room.roomId, { username: 'Marco' });
  expect(imp.userId).not.toBe(room.userId); expect(imp.username).toBe('Marco 2');
  const state = await other.waitFor('room.state', (r) => r.participants.length === 2);
  expect(state.participants.find((p) => p.id === imp.userId)?.role).toBe('viewer');
});
it("another room's token does not resume", async () => { /* join room B with room A's token → resumed false, new userId */ });
it('unknown room → room_not_found', async () => { /* waitFor('error') → code room_not_found */ });
it('21st participant → room_full', async () => { /* use s.app.store.join 19 times + creator, then socket join → code room_full */ });
it('room.state never contains tokens', async () => {
  const state = await c.waitFor('room.state');
  expect(JSON.stringify(state)).not.toContain(room.token);
});
it('long names are sanitized to 32 chars', async () => { /* join with 'x'.repeat(60) → username length 32 */ });
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace=@watch-party/server` → FAIL.
- [ ] **Step 3: Implement `RoomStore` identity + `setupSocketHandlers` + POST `/rooms`**; remove the old files.
- [ ] **Step 4: Run tests** — `npm test` → PASS (and `npm run build:server` → exit 0).
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): token identity, unique names, protocol v2 gate"`

### Task 7: Presence, grace period, host migration, expiry

**Files:**
- Modify: `apps/server/src/roomStore.ts`, `apps/server/src/socketHandlers.ts`, `apps/server/src/app.ts` (sweep timer + `runSweep`)
- Test: `apps/server/test/presence.test.ts`

**Interfaces:**
- Produces on `RoomStore`:
  - `attachSocket(roomId: string, userId: string): void` (sockets++, `leftAt = null`; a `reconnecting` status becomes `unknown` until the next viewer status)
  - `detachSocket(roomId: string, userId: string): void` (sockets--, at 0 → `leftAt = now`, status `reconnecting`)
  - `removeMember(roomId: string, userId: string): boolean`
  - `sweep(): { changedRoomIds: string[]; deletedRoomIds: string[] }`
- Rules (D3): during grace the member stays listed with status `reconnecting` and keeps the host role; on removal of the host, the new host is the earliest `joinedAt` among members with `sockets > 0`, else earliest overall; empty rooms record `emptySince` and are deleted after `ROOM_TTL_MS`. A socket that sends `room.join` while already in another room is `removeMember`-ed from the old room immediately (and `socket.leave`). `room.leave` → `removeMember`. `runSweep()` broadcasts `room.state` to every changed room. Every membership change broadcasts `room.state`.

- [ ] **Step 1: Write the failing tests** (all with `fakeClock()` and `sweepIntervalMs: 0`)

```ts
it('host disconnect within grace keeps role, shows reconnecting', async () => {
  host.close(); clock.advance(10_000); s.app.runSweep();
  const st = await viewer.waitFor('room.state', (r) => r.participants.some((p) => p.id === hostId && p.status === 'reconnecting'));
  expect(st.hostId).toBe(hostId);
});
it('host resumes within grace → same id, still host', async () => {
  host.close(); clock.advance(20_000); s.app.runSweep();
  const back = await connectClient(s.url); const j = await join(back, roomId, { token });
  expect(j).toMatchObject({ userId: hostId, resumed: true });
  expect((await back.waitFor('room.state')).hostId).toBe(hostId);
});
it('after grace the earliest connected viewer becomes host', async () => {
  host.close(); clock.advance(30_001); s.app.runSweep();
  const st = await viewer.waitFor('room.state', (r) => r.hostId === viewerId);
  expect(st.participants.map((p) => p.id)).toEqual([viewerId]);
});
it('two sockets on one token: member stays while one is connected', async () => { /* close one, sweep after 31s, still listed */ });
it('switching rooms removes you from the first room immediately', async () => {
  await join(viewer, roomB);
  const st = await host.waitFor('room.state', (r) => !r.participants.some((p) => p.id === viewerId));
  expect(st.participants).toHaveLength(1);
});
it('room.leave removes immediately and migrates host', async () => { /* host sends room.leave → viewer becomes host */ });
it('empty room is deleted after 30 min and all its data is gone', async () => {
  host.close(); viewer.close(); clock.advance(30_001); s.app.runSweep();
  expect(s.app.store.hasRoom(roomId)).toBe(true);
  clock.advance(30 * 60_000); s.app.runSweep();
  expect(s.app.store.hasRoom(roomId)).toBe(false);
  const c = await connectClient(s.url); c.send({ type: 'room.join', payload: { roomId, token, protocolVersion: 2 } });
  expect((await c.waitFor('error')).code).toBe('room_not_found');
});
it('a created room nobody joins expires', async () => { /* POST, advance 30s + 30min with sweeps → hasRoom false */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** presence on `RoomStore` and wire `connection`/`disconnect`/`room.leave` in `socketHandlers.ts`; sweep timer in `app.ts` (cleared in `close()`).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): presence grace, host migration, room expiry"`

### Task 8: Limits, rate limiting and CORS

**Files:**
- Create: `apps/server/src/rateLimit.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/socketHandlers.ts`
- Test: `apps/server/test/rateLimit.test.ts`, `apps/server/test/limits.test.ts`

**Interfaces:**
- Produces:
  - `class TokenBucket { constructor(capacity: number, refillPerSec: number, now: () => number); take(cost?: number): boolean }`
  - `class KeyedLimiter { constructor(capacity: number, refillPerSec: number, now: () => number, maxKeys?: number /* 10_000, evicts oldest */); take(key: string): boolean }`
  - `SOCKET_LIMITS = { chat: [5, 1], hostUpdate: [20, 10], viewerStatus: [4, 1], request: [3, 0.5], join: [5, 0.1], time: [10, 2] } as const`
  - `IP_LIMITS = { createRoom: [10, 10 / 60], join: [30, 30 / 60], gifs: [30, 30 / 60] } as const`
  - `isAllowedOrigin(origin: string | undefined, extra: readonly string[]): boolean` — true for no origin, `chrome-extension://*`, `http://localhost[:port]`, `http://127.0.0.1[:port]`, and exact matches in `extra` (from `ALLOWED_ORIGINS`).
  - `clientIp(headers: Record<string, string | string[] | undefined>, fallback: string): string` — the **last** `x-forwarded-for` entry (the one appended by the hosting proxy; earlier entries are client-controlled), else `fallback`. Test: `clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, 'x')` → `'1.2.3.4'`.
- Wiring: `new Server(httpServer, { maxHttpBufferSize: 16 * 1024, cors: { origin: (o, cb) => cb(null, isAllowedOrigin(o, extra)) } })`; Express `cors` with the same function and no `credentials`; `express.json({ limit: '4kb' })`. Over-limit socket messages → `error { code: 'rate_limited', message: "You're doing that too fast." }` (chat) or silently dropped (hostUpdate, viewerStatus, time). Over-limit POST `/rooms` → `429 { code: 'rate_limited' }`. Over-limit joins per IP → `error rate_limited`.

- [ ] **Step 1: Write the failing tests**

```ts
// rateLimit.test.ts
it('bucket refills', () => {
  const clock = fakeClock(); const b = new TokenBucket(2, 1, clock.now);
  expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
  clock.advance(1000); expect(b.take()).toBe(true);
});
it('keyed limiter isolates keys and evicts', () => { /* key a exhausted, key b fine; maxKeys 2 evicts oldest */ });
it.each([
  [undefined, true], ['chrome-extension://abcdef', true], ['http://localhost:5173', true],
  ['http://127.0.0.1:3005', true], ['https://evil.com', false], ['http://localhost.evil.com', false],
])('isAllowedOrigin(%s)', (o, ok) => expect(isAllowedOrigin(o, [])).toBe(ok));

// limits.test.ts
it('oversized frame never reaches the room', async () => {
  host.send({ type: 'chat.send', payload: { text: 'A'.repeat(20_000) } });
  await viewer.expectNone('chat.message', 500);
});
it('6th chat message within a second is rate limited', async () => {
  for (let i = 0; i < 6; i++) host.send({ type: 'chat.send', payload: { text: `m${i}` } });
  expect((await host.waitFor('error')).code).toBe('rate_limited');
  // exactly 5 chat.message received by viewer
});
it('11th room creation from one IP in a minute → 429', async () => { /* same x-forwarded-for header */ });
it('CORS echoes extension origins only', async () => {
  const ok = await fetch(`${s.url}/health`, { headers: { Origin: 'chrome-extension://abc' } });
  expect(ok.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc');
  const bad = await fetch(`${s.url}/health`, { headers: { Origin: 'https://evil.com' } });
  expect(bad.headers.get('access-control-allow-origin')).toBeNull();
});
```

This task also adds `RoomStore.addChatMessage(roomId, userId, text): ChatMessage | null` (id `nanoid(12)`, server timestamp) and the `chat.send` → `chat.message` broadcast, so the chat limit can be tested; Task 9 adds the history cap and delivery.

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** `rateLimit.ts` and the wiring.
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): size caps, token buckets, per-ip limits, cors"`

### Task 9: Chat history and system events

**Files:**
- Create: `apps/server/src/systemEvents.ts`
- Modify: `apps/server/src/roomStore.ts`, `apps/server/src/socketHandlers.ts`
- Test: `apps/server/test/chat.test.ts`

**Interfaces:**
- Consumes: `RoomStore.addChatMessage` (Task 8).
- Produces on `RoomStore`: history capped at `LIMITS.historySize` inside `addChatMessage`, and `getChatHistory(roomId: string): ChatMessage[]`.
- Produces in `systemEvents.ts`: `formatClock(sec: number): string` (`m:ss` / `h:mm:ss`), `systemEvent(kind: SystemEvent['kind'], text: string, now: number, user?: { id: string; username: string }): SystemEvent`.
- Behaviour: after `room.joined` the joining socket receives `chat.history { messages }` (also on resume). Broadcast `system.event` for: join (`"Luca joined"`, not on resume), removal after grace or leave (`"Luca left"`), host change (`"Luca is now the host"`).

- [ ] **Step 1: Write the failing tests**

```ts
it('late joiner gets chat history in order', async () => {
  host.send({ type: 'chat.send', payload: { text: 'before you came' } });
  await host.waitFor('chat.message');
  const late = await connectClient(s.url); await join(late, roomId);
  expect((await late.waitFor('chat.history')).messages.map((m) => m.text)).toEqual(['before you came']);
});
it('history keeps the last 100', async () => {
  for (let i = 0; i < 105; i++) s.app.store.addChatMessage(roomId, hostId, `m${i}`);
  const h = await (async () => { const c = await connectClient(s.url); await join(c, roomId); return c.waitFor('chat.history'); })();
  expect(h.messages).toHaveLength(100); expect(h.messages[0].text).toBe('m5');
});
it('chat.message carries userId and trims text', async () => { /* '  hi  ' → 'hi', userId === hostId */ });
it('resume also gets history', async () => { /* rejoin with token → chat.history */ });
it('emits join, leave and host change events', async () => {
  await join(viewer, roomId, { username: 'Luca' });
  expect((await host.waitFor('system.event', (e) => e.kind === 'join')).text).toBe('Luca joined');
  host.send({ type: 'room.leave', payload: {} });
  expect((await viewer.waitFor('system.event', (e) => e.kind === 'host_change')).text).toBe('Luca is now the host');
});
it('formats clock', () => { expect(formatClock(62)).toBe('1:02'); expect(formatClock(3725)).toBe('1:02:05'); });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): chat history on join and presence system events"`

### Task 10: Server-side sync — time, timeline, viewer status, requests

**Files:**
- Modify: `apps/server/src/roomStore.ts`, `apps/server/src/socketHandlers.ts`, `apps/server/src/systemEvents.ts`
- Test: `apps/server/test/sync.test.ts`

**Interfaces:**
- Consumes: `HostUpdate`, `Timeline` (Task 2)
- Produces on `RoomStore`:
  - `applyHostUpdate(roomId: string, userId: string, update: HostUpdate): { timeline: Timeline; previous: Timeline | null } | null` — null when not host. `rev = (previous?.rev ?? 0) + 1`; `anchorServerMs = clamp(update.atServerMs, now − 5000, now + 1000)`; `updatedBy = username`.
  - `forceTimeline(roomId: string, userId: string): Timeline | null` — host only; same timeline, `rev + 1`, `cause: 'force'`, re-anchored to now using `expectedPositionSec`.
  - `getTimeline(roomId: string): Timeline | null`
  - `setViewerStatus(roomId: string, userId: string, status: UserStatus): boolean` — returns true when the stored status changed (caller then broadcasts `room.state`). Host's own status is ignored.
- Produces in `systemEvents.ts`: `describeTimelineChange(prev: Timeline | null, next: Timeline, username: string): { kind: SystemEvent['kind']; text: string } | null`:
  - `media` → `Marco started "Title"` (or `Marco started a new video` without title)
  - `play` → `Marco pressed play`; `pause` → `Marco paused at 1:02`; `seek` → `Marco jumped to 12:34`; `force` → `Marco synced everyone`
  - `initial`, `rate`, `ad`, `heartbeat` → null
  - `requestText(reason, username)`: resync → `Luca asked to resync`, pause → `Luca asked the host to pause`, play → `…to play`, back → `…to go back`, forward → `…to go forward`
- Socket: `socket.on(TIME_EVENT, (ack) => ack(now()))` behind the `time` bucket. `sync.host_update` from non-host → `error { code: 'not_host', message: 'Only the host controls playback.' }`. Timeline broadcast as `sync.timeline` to the room. A joining socket receives the current `sync.timeline` right after `room.state`. `sync.request` (viewers only) → host sockets get `sync.request { reason, userId, username }` and the room gets a `request` system event. `sync.force` (host only) → broadcast forced timeline + `force` system event.

- [ ] **Step 1: Write the failing tests**

```ts
const upd = (o: Partial<HostUpdate> = {}): HostUpdate => ({ platform: 'youtube', mediaId: 'dQw4w9WgXcQ', title: 'Song',
  positionSec: 62, atServerMs: clock.now(), rate: 1, paused: true, inAd: false, cause: 'pause', ...o });

it('time ack returns server now', async () => expect(await host.time()).toBe(clock.now()));
it('host update → rev 1 timeline to everyone', async () => {
  host.send({ type: 'sync.host_update', payload: upd() });
  expect(await viewer.waitFor('sync.timeline')).toMatchObject({ rev: 1, positionSec: 62, anchorServerMs: clock.now(), updatedBy: 'Marco' });
});
it('clamps bogus clocks', async () => {
  host.send({ type: 'sync.host_update', payload: upd({ atServerMs: clock.now() + 60_000 }) });
  expect((await viewer.waitFor('sync.timeline')).anchorServerMs).toBe(clock.now() + 1000);
});
it('viewer cannot drive playback (hijack regression)', async () => {
  viewer.send({ type: 'sync.host_update', payload: upd() });
  expect((await viewer.waitFor('error')).code).toBe('not_host');
  expect(s.app.store.getTimeline(roomId)).toBeNull();
});
it('rev is server-owned', async () => { /* send two updates with extra {rev: 999} → revs 1 and 2 */ });
it('late joiner receives the current timeline', async () => { /* update, then new client joins → waitFor sync.timeline rev 1 */ });
it.each([
  ['pause', { paused: true }, 'Marco paused at 1:02'],
  ['play', { paused: false }, 'Marco pressed play'],
  ['seek', { positionSec: 754 }, 'Marco jumped to 12:34'],
  ['media', { mediaId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' }, 'Marco started "Big Buck Bunny"'],
])('%s produces a system event', async (cause, o, text) => { /* send upd({cause, ...o}) → system.event text */ });
it('heartbeat produces no event', async () => { /* expectNone('system.event', 300) */ });
it('viewer status change re-broadcasts room.state once', async () => {
  viewer.send({ type: 'sync.viewer_status', payload: { rev: 1, driftSec: 2, state: 'drifting' } });
  await host.waitFor('room.state', (r) => r.participants.find((p) => p.id === viewerId)?.status === 'drifting');
  viewer.send({ type: 'sync.viewer_status', payload: { rev: 1, driftSec: 2.1, state: 'drifting' } });
  await host.expectNone('room.state', 300);
});
it('viewer request reaches host', async () => {
  viewer.send({ type: 'sync.request', payload: { reason: 'pause' } });
  expect(await host.waitFor('sync.request')).toMatchObject({ reason: 'pause', username: 'Luca' });
  expect((await host.waitFor('system.event', (e) => e.kind === 'request')).text).toBe('Luca asked the host to pause');
});
it('force re-broadcasts with cause force and next rev', async () => { /* host update then sync.force → rev 2 cause force */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): clock endpoint, server-owned timeline, viewer status, requests"`

### Task 11: Giphy proxy

**Files:**
- Create: `apps/server/src/gifs.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/gifs.test.ts`

**Interfaces:**
- Consumes: `isAllowedGifUrl` (Task 1), `KeyedLimiter`, `IP_LIMITS.gifs`, `clientIp` (Task 8)
- Produces:
  - `type Gif = { id: string; url: string; width: number; height: number }`
  - `createGifRoute(opts: { apiKey?: string; fetchImpl: typeof fetch; now: () => number }): express.RequestHandler`
  - `GET /gifs?q=<0..50 chars>` → `200 { gifs: Gif[] }` (max 12). Empty `q` → trending. No key → `503 { error: 'gifs_unavailable' }`. `q` > 50 → `400`. Over IP limit → `429`.
  - Upstream: `https://api.giphy.com/v1/gifs/search?api_key=KEY&q=Q&limit=12&rating=pg-13` / `.../trending?api_key=KEY&limit=12&rating=pg-13` (no `lang`). Image = `images.fixed_height` (`url`, `width`, `height` parsed to numbers); entries whose url fails `isAllowedGifUrl` are dropped. Cache key = lowercased trimmed `q`, TTL 10 min, max 200 entries (oldest evicted).

- [ ] **Step 1: Write the failing tests**

```ts
const giphyBody = { data: [
  { id: 'a', images: { fixed_height: { url: 'https://media1.giphy.com/media/a/200.gif', width: '356', height: '200' } } },
  { id: 'b', images: { fixed_height: { url: 'https://evil.com/b.gif', width: '1', height: '1' } } },
] };
it('proxies search and filters hosts', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(giphyBody)));
  const s = await startTestServer({ giphyApiKey: 'K', fetchImpl });
  const r = await (await fetch(`${s.url}/gifs?q=cats`)).json();
  expect(r.gifs).toEqual([{ id: 'a', url: 'https://media1.giphy.com/media/a/200.gif', width: 356, height: 200 }]);
  expect(String(fetchImpl.mock.calls[0][0])).toContain('q=cats'); expect(String(fetchImpl.mock.calls[0][0])).not.toContain('lang=');
});
it('caches identical queries', async () => { /* two requests → fetchImpl called once */ });
it('503 without key', async () => { /* status 503, { error: 'gifs_unavailable' } */ });
it('400 on long query', async () => { /* q = 'x'.repeat(51) */ });
it('empty q uses trending', async () => { /* url contains '/trending' */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/server && git commit -m "feat(server): giphy proxy with cache and host allowlist"`

### Task 12: Deployable server image

**Files:**
- Modify: `apps/server/Dockerfile`, `docker-compose.yml`, `apps/server/.env.example`

**Interfaces:** none new.

- Dockerfile: `FROM node:24-slim`, `WORKDIR /usr/src/app`, copy root `package.json`, `package-lock.json`, `packages/shared`, `apps/server`; `RUN npm ci --workspace=@watch-party/shared --workspace=@watch-party/server --include-workspace-root`; `RUN npm run build:server`; `ENV NODE_ENV=production PORT=3001`; `EXPOSE 3001`; `CMD ["node", "apps/server/dist/index.js"]`. Add `.dockerignore` at repo root excluding `node_modules`, `apps/extension`, `**/dist`, `watch-pizza-party-*`, `WatchParty_Graphic`, `Screenshot*`, `*.zip`.
- docker-compose: drop the unused `server-data` volume; pass `GIPHY_API_KEY` from the environment.
- `.env.example`: `PORT=3005`, `GIPHY_API_KEY=`, `ALLOWED_ORIGINS=`.

- [ ] **Step 1: Build the image**

Run: `docker build -f apps/server/Dockerfile -t wpp-server:2 .`
Expected: build succeeds. If `docker` is not installed, record that and instead run `npm ci --workspace=@watch-party/shared --workspace=@watch-party/server --include-workspace-root --dry-run` to confirm the install command resolves.

- [ ] **Step 2: Smoke-run it**

Run: `docker run --rm -d -p 3101:3001 --name wpp2 wpp-server:2 && sleep 2 && curl -s localhost:3101/health && docker stop wpp2`
Expected: `{"ok":true}`.

- [ ] **Step 3: Commit** — `git add apps/server/Dockerfile .dockerignore docker-compose.yml apps/server/.env.example && git commit -m "build(server): working node 24 docker image"`

---
## Part C — Extension core (`apps/extension`)

Chrome glue (listeners, `chrome.*` calls) stays thin; decisions live in pure functions or in classes that take their dependencies as arguments, and those are unit-tested with Vitest. The real browser behaviour is covered by the E2E test in Task 25.

### Task 13: Build pipeline, manifest and test tooling

**Files:**
- Create: `apps/extension/vite.scripts.config.mjs`, `apps/extension/scripts/check-dist.mjs`, `apps/extension/vitest.config.mjs`, `apps/extension/src/config.ts`, `apps/extension/src/vite-env.d.ts`
- Modify: `apps/extension/vite.config.mjs`, `apps/extension/package.json`, `apps/extension/manifest.json`, `apps/extension/src/background.ts` (only: `openPanelOnActionClick: true`, import `DEFAULT_SERVER_URL` from `./config`)
- Delete: `apps/extension/vite.config.js`, `apps/extension/popup.html`, `apps/extension/src/popup.tsx`

**Interfaces:**
- Produces: `DEFAULT_SERVER_URL: string` (from `import.meta.env.VITE_SERVER_URL`, fallback `https://watch-pizza-party.onrender.com`) in `src/config.ts`.
- Build contract:
  - `vite.config.mjs` entries: `main` (`index.html`), `background` (`src/background.ts` for now; becomes `src/background/index.ts` in Task 15), `offscreen` (`src/offscreen.ts`). Static copy: `manifest.json`, `offscreen.html` only.
  - `vite.scripts.config.mjs` builds one classic script per run from `process.env.SCRIPT_ENTRY` (`content` → `src/content.ts` now, `src/content/index.ts` from Task 17; `player-bridge` → `src/player-bridge.ts`) with `build.lib: { formats: ['iife'], name: 'wpp_<entry>' }`, `outDir: 'dist'`, `emptyOutDir: false`, `fileName: () => '<entry>.js'`, same `@watch-party/shared` alias.
  - `package.json` scripts: `"build": "tsc --noEmit && vite build -c vite.config.mjs && SCRIPT_ENTRY=content vite build -c vite.scripts.config.mjs && SCRIPT_ENTRY=player-bridge vite build -c vite.scripts.config.mjs && node scripts/check-dist.mjs"`, `"test": "vitest run"`; devDeps `vitest@^3.2.4`, `jsdom@^25`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`; version `2.0.0`.
  - `check-dist.mjs` exits 1 with a message when: any `dist/**/*.ts` exists; `dist/content.js` or `dist/player-bridge.js` matches `/^\s*(import|export)\s/m`; `dist/manifest.json` has a permission or host permission not in the v1.2 baseline (`sidePanel, storage, activeTab, scripting, tabs, tabCapture, offscreen` / `https://*.netflix.com/*, https://*.youtube.com/*, https://youtu.be/*, https://watch-pizza-party.onrender.com/*`); any file under `apps/extension/src` contains `chrome.tabs.update(` together with `active: true` on the same call.
- Manifest: `version: "2.0.0"`; remove `action.default_popup` (keep icons); content script `content.js` gets `all_frames: false` and loses `match_about_blank`; remove `web_accessible_resources`.

- [ ] **Step 1: Make the changes above.**
- [ ] **Step 2: Build**

Run: `npm install && npm run build:extension`
Expected: exits 0; `check-dist` prints `dist ok`; `ls apps/extension/dist` shows `content.js player-bridge.js background.js offscreen.js index.html manifest.json` and no `content.ts`, no `popup.html`.

- [ ] **Step 3: Prove the guard works**

Run: `echo 'export {}' >> apps/extension/dist/content.js && node apps/extension/scripts/check-dist.mjs; echo "exit=$?"`
Expected: an error naming `content.js` and `exit=1`. Rebuild afterwards (`npm run build:extension`).

- [ ] **Step 4: Run tests** — `npm test` → exit 0 (Vitest reports no extension tests yet; configure `passWithNoTests: true`).
- [ ] **Step 5: Commit** — `git add apps/extension package-lock.json && git commit -m "build(extension): classic content scripts, dist guard, no popup, v2.0.0 manifest"`

### Task 14: Message contract and persisted session

**Files:**
- Create: `apps/extension/src/lib/messages.ts`, `apps/extension/src/background/sessionStore.ts`
- Test: `apps/extension/src/lib/messages.test.ts`, `apps/extension/src/background/sessionStore.test.ts`

**Interfaces:**
- Consumes: protocol types (Task 2), `ViewerSyncState`, `HostUpdateCause`, `SyncRequestReason`, `Timeline`, `Room`, `ChatMessage`, `SystemEvent`, `SupportedPlatform`
- Produces in `messages.ts`:
  - `type PublicSession = { status: 'idle' | 'connecting' | 'waking' | 'joined' | 'reconnecting' | 'error'; roomId: string | null; me: { userId: string; username: string; avatarColor: string } | null; isHost: boolean; room: Room | null; mediaTab: { tabId: number; title: string } | null; mySync: ViewerSyncState | null; serverUrl: string; error: { code?: string; message: string } | null; volumeGain: number; unread: number }`
  - `type PanelRequest = { type: 'session.get' } | { type: 'session.create'; username: string; tabId: number } | { type: 'session.join'; roomId: string; username: string; tabId: number } | { type: 'session.leave' } | { type: 'session.useTab'; tabId: number } | { type: 'chat.send'; text: string } | { type: 'sync.force' } | { type: 'sync.request'; reason: SyncRequestReason } | { type: 'sync.resyncMe' } | { type: 'server.setUrl'; url: string } | { type: 'panel.minimize' } | { type: 'volume.start'; tabId: number; streamId: string; gain: number } | { type: 'volume.setGain'; gain: number } | { type: 'volume.stop' }`
  - `type PanelResponse = { ok: true; state: PublicSession } | { ok: false; error: string; code?: string }`
  - `type TimelineEntry = { kind: 'chat'; message: ChatMessage } | { kind: 'system'; event: SystemEvent }`
  - `type BackgroundEvent = { type: 'bg.session'; state: PublicSession } | { type: 'bg.entries'; entries: TimelineEntry[] }`
  - `type HostPlayerEvent = { platform: SupportedPlatform; mediaId: string; title?: string; positionSec: number; capturedAtLocalMs: number; rate: number; paused: boolean; inAd: boolean; cause: HostUpdateCause }`
  - `type BubbleState = { visible: boolean; participants: number; unread: number; connected: boolean; request: SyncRequestReason | null }`
  - `type ContentToBackground = { type: 'content.hello'; url: string } | { type: 'content.hostEvent'; event: HostPlayerEvent } | { type: 'content.viewerStatus'; rev: number; driftSec: number; state: ViewerSyncState } | { type: 'content.openPanel' } | { type: 'content.dismissBubble' }`
  - `type BackgroundToContent = { type: 'bg.activate'; role: 'host' | 'viewer' } | { type: 'bg.deactivate' } | { type: 'bg.timeline'; timeline: Timeline; clockOffsetMs: number; force: boolean } | { type: 'bg.clock'; clockOffsetMs: number } | { type: 'bg.bubble'; bubble: BubbleState }`
  - `ContentToBackgroundSchema` (Zod) and `parseContentMessage(raw: unknown): ContentToBackground | null`
- Produces in `sessionStore.ts`:
  - `type PersistedSession = { roomId: string; token: string; username: string; mediaTabId: number | null; savedAt: number }`
  - `SESSION_MAX_AGE_MS = 8 * 3_600_000`; `sessionKey(incognito: boolean): string` → `'wpp.session.v2.regular' | 'wpp.session.v2.incognito'`
  - `type KeyValueArea = Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>`
  - `loadSession(area: KeyValueArea, key: string, now: number): Promise<PersistedSession | null>`, `saveSession(area, key, s: PersistedSession): Promise<void>`, `clearSession(area, key): Promise<void>`
  - `LEGACY_KEYS = ['watchparty_active_session', 'watchparty_active_session_regular', 'watchparty_active_session_incognito', 'roomId', 'watchparty_volume_boost']`; `migrateLegacyKeys(area): Promise<void>` removes them.

- [ ] **Step 1: Write the failing tests**

```ts
// messages.test.ts
it('accepts valid content messages and rejects junk', () => {
  expect(parseContentMessage({ type: 'content.viewerStatus', rev: 1, driftSec: 0.1, state: 'synced' })).not.toBeNull();
  expect(parseContentMessage({ type: 'content.hostEvent', event: { platform: 'youtube', mediaId: '../x' } })).toBeNull();
  expect(parseContentMessage({ type: 'WATCHPARTY_PING' })).toBeNull();
});
// sessionStore.test.ts — memoryArea() is a Map-backed fake implementing get/set/remove
it('round-trips', async () => { /* save then load returns the same object */ });
it('expires after 8h and clears the key', async () => {
  await saveSession(a, k, { ...s, savedAt: 0 });
  expect(await loadSession(a, k, SESSION_MAX_AGE_MS + 1)).toBeNull();
  expect(await a.get(k)).toEqual({});
});
it('rejects malformed data', async () => { /* { roomId: 5 } → null */ });
it('uses separate keys for incognito', () => expect(sessionKey(true)).not.toBe(sessionKey(false)));
it('removes legacy keys', async () => { /* set all LEGACY_KEYS, migrate, get → {} */ });
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace=@watch-party/extension` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git add apps/extension/src/lib apps/extension/src/background && git commit -m "feat(extension): typed message contract and persisted session"`

### Task 15: Background — connection, session controller, router

**Files:**
- Create: `apps/extension/src/background/connection.ts`, `apps/extension/src/background/createRoom.ts`, `apps/extension/src/background/sessionController.ts`, `apps/extension/src/background/index.ts`
- Delete: `apps/extension/src/background.ts`
- Modify: `apps/extension/vite.config.mjs` (background entry → `src/background/index.ts`)
- Test: `apps/extension/src/background/createRoom.test.ts`, `apps/extension/src/background/sessionController.test.ts`

**Interfaces:**
- Consumes: `ClockSync` (Task 3), protocol (Task 2), `messages.ts` and `sessionStore.ts` (Task 14), `DEFAULT_SERVER_URL` (Task 13)
- Produces:
  - `class ServerConnection { constructor(opts: { url: string; onMessage: (m: ServerMessage) => void; onStatus: (s: 'connecting' | 'connected' | 'disconnected') => void; onClock: (offsetMs: number) => void; ioFactory?: typeof io }); connect(): void; disconnect(): void; send(m: ClientMessage): void; readonly clock: ClockSync }` — Socket.IO with `transports: ['websocket']`, infinite reconnection; on each `connect`: 5 time samples 150 ms apart via `socket.timeout(2000).emitWithAck(TIME_EVENT)`, then one every 15 s; incoming messages parsed with `ServerMessageSchema` (invalid ones dropped).
  - `createRoomWithRetry(opts: { baseUrl: string; username: string; fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => number; onWaking: () => void }): Promise<CreateRoomResponse>` — retries network errors, timeouts (8 s per attempt via `AbortSignal.timeout`) and 5xx with delays `[2000, 3000, 5000, 8000, 10000, 10000, …]` until 75 s have elapsed, calling `onWaking()` once after the first failure; 426 → throws `UpdateRequiredError` (message = `UPDATE_REQUIRED_MESSAGE`) immediately; 429 → throws `Error("Too many parties started from this network. Try again in a minute.")`; timeout → `Error("The server didn't wake up. Try again in a minute.")`.
  - `class SessionController { constructor(deps: { storage: KeyValueArea; storageKey: string; now: () => number; connectionFactory: (handlers) => ServerConnectionLike; createRoom: typeof createRoomWithRetry; serverUrl: () => string; emit: (s: PublicSession) => void; onTimeline: (t: Timeline, force: boolean) => void; onEntries: (e: TimelineEntry[], replace: boolean) => void; onHostRequest: (r: SyncRequestReason) => void }); state(): PublicSession; restore(): Promise<void>; create(username: string, tabId: number, tabTitle: string): Promise<void>; join(roomId: string, username: string, tabId: number, tabTitle: string): Promise<void>; leave(): Promise<void>; useTab(tabId: number, title: string): Promise<void>; clearMediaTab(): void; send(m: ClientMessage): void; setPanelOpen(open: boolean): void; setMySync(s: ViewerSyncState | null): void; clockOffsetMs(): number }` where `ServerConnectionLike = Pick<ServerConnection, 'connect' | 'disconnect' | 'send'> & { clock: { offsetMs: number | null } }`.
    - On `room.joined`: persist `{ roomId, token, username, mediaTabId, savedAt }`, set `me`, `status: 'joined'`.
    - On `room.state`: `room`, `isHost = room.hostId === me.userId` (never by name).
    - On `chat.history` → `onEntries(…, true)`; `chat.message` / `system.event` → `onEntries([…], false)`; `chat.message` from another user while the panel is closed → `unread + 1` (capped 999); `setPanelOpen(true)` resets it.
    - On `sync.timeline` → `onTimeline(t, t.cause === 'force')`. On `sync.request` (host only) → `onHostRequest`.
    - On `error`: `room_not_found` / `update_required` / `room_full` → clear persisted session, `status: 'error'`, disconnect; others → `error` only.
    - Connection `disconnected` while joined → `status: 'reconnecting'`; reconnect re-sends `room.join` with the stored token.
  - `background/index.ts`: builds the controller with real `chrome.*`, runs `migrateLegacyKeys` then `restore()` at startup (a persisted `mediaTabId` that `chrome.tabs.get` can't find — e.g. after a browser restart — is dropped, leaving the session with no media tab), `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, routes `PanelRequest`s (validating `type`) and returns `PanelResponse`, broadcasts `BackgroundEvent`s with `chrome.runtime.sendMessage`, tracks panel presence through `chrome.runtime.onConnect` ports named `wpp-panel` (open = at least one port). Sync wiring to tabs arrives in Task 16; volume in Task 19; bubble in Task 18; entries cache in Task 20.

- [ ] **Step 1: Write the failing tests**

```ts
// createRoom.test.ts
it('retries through a cold start', async () => {
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(Response.json(created));
  const onWaking = vi.fn();
  await expect(createRoomWithRetry({ ...base, fetchImpl, onWaking })).resolves.toEqual(created);
  expect(onWaking).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ protocolVersion: 2, username: 'Marco' });
});
it('stops immediately on 426', async () => { /* rejects with UPDATE_REQUIRED_MESSAGE, fetch called once */ });
it('gives up after 75s', async () => { /* fake now advanced by sleep; always rejects → "The server didn't wake up. Try again in a minute." */ });

// sessionController.test.ts — fakeConnection() records sent messages and exposes emit(serverMessage)
it('persists the token from room.joined and resumes with it after restart', async () => {
  await c.join('ROOM123456', 'Luca', 7, 'Video');
  conn.emit({ type: 'room.joined', payload: { roomId: 'ROOM123456', userId: 'u1', token: 'T'.repeat(24), username: 'Luca', avatarColor: '#3DD68C', resumed: false } });
  const c2 = makeController({ storage }); await c2.restore();
  expect(conn2.sent[0]).toEqual({ type: 'room.join', payload: { roomId: 'ROOM123456', token: 'T'.repeat(24), username: 'Luca', protocolVersion: 2 } });
});
it('isHost comes from userId, not username', async () => { /* room.state hostId 'u1' with another participant also named 'Luca' → isHost true only for u1 */ });
it('room_not_found clears storage and shows the error', async () => { /* status error, storage empty */ });
it('counts unread from others only while the panel is closed', async () => { /* own message → 0; other → 1; setPanelOpen(true) → 0 */ });
it('disconnect while joined → reconnecting', async () => { /* conn status disconnected → state.status 'reconnecting' */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** the four modules; delete `background.ts`. Keep the old `App.tsx` compiling (it only uses its own local types and `chrome.runtime.sendMessage`); it will not work at runtime until Task 23.
- [ ] **Step 4: Run tests and build** — `npm test && npm run build:extension` → PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): background rewrite on protocol v2"`

### Task 16: Media tab binding and viewer navigation

**Files:**
- Create: `apps/extension/src/background/mediaTab.ts`
- Modify: `apps/extension/src/background/index.ts`
- Test: `apps/extension/src/background/mediaTab.test.ts`

**Interfaces:**
- Consumes: `extractMedia`, `canonicalWatchUrl` (Task 1), `Timeline`
- Produces:
  - `type MediaTabRef = { tabId: number; url: string | undefined }`
  - `planViewerNavigation(args: { timeline: Timeline | null; mediaTab: MediaTabRef | null; lastNavigatedKey: string | null; force: boolean }): { action: 'none' } | { action: 'navigate'; tabId: number; url: string; key: string }` — `key = "<platform>:<mediaId>"`; navigate only when the tab's `extractMedia(url)` differs from the timeline's media and (`key !== lastNavigatedKey` or `force`). Never navigates without a bound tab.
  - `shouldAcceptHostEvent(senderTabId: number | undefined, mediaTabId: number | null): boolean`
- Wiring in `index.ts`:
  - The media tab is set only by `session.create`, `session.join` and `session.useTab`. `chrome.tabs.onRemoved` of the media tab → `controller.clearMediaTab()` and `bg.deactivate` nowhere else.
  - On `content.hello` from the media tab → reply/send `bg.activate { role }`, then the latest `bg.timeline` for viewers.
  - On timeline (viewer) → `planViewerNavigation` → `chrome.tabs.update(tabId, { url })` (no `active`), remember key; else send `bg.timeline` to the media tab. On clock updates → `bg.clock` to the media tab.
  - On `content.hostEvent` when `shouldAcceptHostEvent` and `isHost` → `sync.host_update` with `atServerMs = clock.toServerTime(event.capturedAtLocalMs)`.
  - On `content.viewerStatus` from the media tab → `sync.viewer_status` and `controller.setMySync(state)`.
  - Role change (host migrates) → send `bg.activate` with the new role. `session.leave` → `bg.deactivate`.
  - `sync.resyncMe` → re-send the latest timeline with `force: true` and re-run navigation with `force: true`.
  - After an extension update, existing YouTube/Netflix tabs have no content script: on `session.create/join/useTab`, if a `ping` to the tab fails, `chrome.scripting.executeScript({ target: { tabId }, files: ['player-bridge.js'], world: 'MAIN' })` then `files: ['content.js']`.

- [ ] **Step 1: Write the failing tests**

```ts
const tl = (mediaId = 'dQw4w9WgXcQ') => ({ ...baseTimeline, platform: 'youtube', mediaId }) as Timeline;
it('navigates a bound tab to the canonical url', () =>
  expect(planViewerNavigation({ timeline: tl(), mediaTab: { tabId: 4, url: 'https://www.youtube.com/' }, lastNavigatedKey: null, force: false }))
    .toEqual({ action: 'navigate', tabId: 4, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', key: 'youtube:dQw4w9WgXcQ' }));
it('no media tab → none (never another tab)', () =>
  expect(planViewerNavigation({ timeline: tl(), mediaTab: null, lastNavigatedKey: null, force: false })).toEqual({ action: 'none' }));
it('already on the video → none', () => { /* tab url https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5 */ });
it('navigates once per media unless forced', () => { /* lastNavigatedKey === key → none; force → navigate */ });
it('no timeline → none', () => { /* timeline null */ });
it('host events only from the bound tab', () => {
  expect(shouldAcceptHostEvent(3, 3)).toBe(true); expect(shouldAcceptHostEvent(4, 3)).toBe(false); expect(shouldAcceptHostEvent(undefined, 3)).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** `mediaTab.ts` and the wiring.
- [ ] **Step 4: Run tests and build** — PASS / exit 0; `grep -rn "active: true" apps/extension/src` → no matches.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): explicit media tab binding and safe viewer navigation"`

### Task 17: Content script — adapters, host reporter, viewer follower

**Files:**
- Create: `apps/extension/src/content/index.ts`, `apps/extension/src/content/bridge.ts`, `apps/extension/src/content/adapters.ts`, `apps/extension/src/content/hostReporter.ts`, `apps/extension/src/content/viewerFollower.ts`
- Delete: `apps/extension/src/content.ts`
- Modify: `apps/extension/src/player-bridge.ts` (remove `youtube.state`; keep `youtube.play|pause|seek|rate`, `netflix.state|play|pause|seek`), `apps/extension/vite.scripts.config.mjs` (content entry → `src/content/index.ts`)
- Test: `apps/extension/src/content/hostReporter.test.ts`, `apps/extension/src/content/viewerFollower.test.ts`

**Interfaces:**
- Consumes: `decideCorrection`, `SYNC_PROFILES`, `expectedPositionSec`, `isTimelinePaused`, `PlayerSnapshot`, `MediaRef`, `extractMedia` (Tasks 1, 4); `HostPlayerEvent`, `BackgroundToContent`, `ContentToBackground` (Task 14)
- Produces:
  - `callBridge(command: BridgeCommand, payload?: Record<string, unknown>): { handled: boolean; payload?: Record<string, unknown> } | null` — synchronous `CustomEvent` round trip with the main-world `player-bridge.js` (already loaded by the manifest; no `<script>` injection).
  - `interface PlayerAdapter { readonly platform: SupportedPlatform; media(): MediaRef | null; title(): string | undefined; snapshot(): PlayerSnapshot | null; play(): void; pause(): void; seek(sec: number): void; setRate(rate: number): void }`
  - `createYouTubeAdapter(doc: Document, loc: Location): PlayerAdapter` — snapshot from `video.html5-main-video` (`currentTime`, `paused`, `playbackRate`, `buffering = !paused && readyState < 3`, `inAd = #movie_player.classList.contains('ad-showing')`); commands via bridge, falling back to the element. Title = `document.title` without the trailing ` - YouTube`.
  - `createNetflixAdapter(doc: Document, loc: Location): PlayerAdapter` — snapshot from bridge `netflix.state` (`positionSec`, `paused`, `buffering`, `inAd` via the existing ad selectors), rate 1; commands via bridge only; `setRate` is a no-op; never writes `video.currentTime`.
  - `adapterFor(loc: Location, doc: Document): PlayerAdapter | null`
  - `type HostSample = { media: MediaRef; positionSec: number; paused: boolean; rate: number; inAd: boolean; atLocalMs: number }`
  - `classifyHostChange(prev: HostSample | null, next: HostSample): HostUpdateCause | null` — order: `initial` (no prev) → `media` → `ad` (inAd flipped) → `play`/`pause` → `rate` (|Δ| > 0.01) → `seek` (|observedΔ − expectedΔ| > 1.0 s, expected = elapsed × rate when playing and not in ad, else 0) → null.
  - `class HostReporter { constructor(adapter: PlayerAdapter, send: (e: HostPlayerEvent) => void, now: () => number); tick(): void }` — samples every tick; emits when `classifyHostChange` ≠ null, or a `heartbeat` 5 s after the last emit while playing; emits nothing when `adapter.media()` or `snapshot()` is null.
  - `class ViewerFollower { constructor(adapter: PlayerAdapter, send: (s: { rev: number; driftSec: number; state: ViewerSyncState }) => void, now: () => number); setTimeline(t: Timeline, clockOffsetMs: number, force: boolean): void; setClock(offsetMs: number): void; tick(): void }` — no-op when no timeline or `adapter.media()` ≠ timeline media; target = `{ positionSec: expectedPositionSec(t, now + offset), paused: isTimelinePaused(t), rate: t.rate }`; applies `decideCorrection` actions in order; records `lastSeekAtMs` on seek; `force` applies to exactly one tick; reports status when `state` changes or 2 s passed since the last report.
  - `content/index.ts`: guards double boot; sends `content.hello` on boot and on `yt-navigate-finish`; on `bg.activate` starts one 250 ms interval running the reporter (host) or follower (viewer); while active, also checks `location.href` every 1 s for SPA navigation (Netflix) and re-creates the adapter; `bg.deactivate` clears every timer. **Inactive pages run no timers.**

- [ ] **Step 1: Write the failing tests**

```ts
// hostReporter.test.ts
const s = (o: Partial<HostSample> = {}): HostSample => ({ media: { platform: 'youtube', mediaId: 'dQw4w9WgXcQ' }, positionSec: 10, paused: false, rate: 1, inAd: false, atLocalMs: 0, ...o });
it.each([
  [null, s(), 'initial'],
  [s(), s({ media: { platform: 'youtube', mediaId: 'aqz-KE-bpKQ' }, atLocalMs: 250 }), 'media'],
  [s(), s({ inAd: true, atLocalMs: 250 }), 'ad'],
  [s(), s({ paused: true, positionSec: 10.25, atLocalMs: 250 }), 'pause'],
  [s({ paused: true }), s({ paused: false, atLocalMs: 250 }), 'play'],
  [s(), s({ rate: 1.5, positionSec: 10.25, atLocalMs: 250 }), 'rate'],
  [s(), s({ positionSec: 60, atLocalMs: 250 }), 'seek'],
  [s(), s({ positionSec: 10.26, atLocalMs: 250 }), null],
])('classify %#', (prev, next, cause) => expect(classifyHostChange(prev, next)).toBe(cause));
it('host reporter is silent without a media id (YouTube home)', () => {
  const sent: HostPlayerEvent[] = []; const r = new HostReporter(fakeAdapter({ media: null }), (e) => sent.push(e), clock.now);
  r.tick(); clock.advance(10_000); r.tick(); expect(sent).toEqual([]);
});
it('heartbeats every 5s while playing', () => { /* ticks across 5.1s → causes ['initial','heartbeat'] */ });

// viewerFollower.test.ts — fakeAdapter records calls and returns a mutable snapshot
it('far behind and paused → seek then play', () => {
  f.setTimeline(timeline({ positionSec: 100, anchorServerMs: 0, paused: false }), 0, false);
  adapter.snap = { positionSec: 10, paused: true, rate: 1, buffering: false, inAd: false };
  clock.set(0); f.tick();
  expect(adapter.calls).toEqual([['seek', 100.1], ['play']]);
});
it('does nothing on a different video', () => { /* adapter.media() returns other id → no calls, no status */ });
it('host in an ad → viewer pauses and holds', () => { /* timeline inAd: true, player playing → ['pause'] */ });
it('viewer in an ad → no corrections, reports ad', () => { /* snapshot inAd → calls [], status state 'ad' */ });
it('force applies once', () => { /* setTimeline(..., force true) with 0.2s drift inside cooldown → seek on first tick only */ });
it('reports status on change or every 2s', () => { /* 3 ticks within 1s same state → 1 report; after 2s → 2 */ });
it('uses the clock offset', () => { /* offset +5000 shifts expected position by 5s */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** the modules; delete the old `content.ts`.
- [ ] **Step 4: Run tests and build** — PASS / exit 0 (check-dist confirms `content.js` is still a classic script).
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): content script with adapters, host reporter and controller-driven follower"`

### Task 18: Floating bubble

**Files:**
- Create: `apps/extension/src/content/bubble.ts`
- Modify: `apps/extension/src/content/index.ts`, `apps/extension/src/background/index.ts`
- Test: `apps/extension/src/content/bubble.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `BubbleState` (Task 14)
- Produces: `createBubble(doc: Document, handlers: { onOpen(): void; onDismiss(): void }, storage?: Storage): { render(state: BubbleState): void; destroy(): void }`
  - Host element `<wpp-bubble>` with an **open** shadow root, appended to `document.fullscreenElement ?? document.body` (re-parented on `fullscreenchange`). Fixed at `right: 12px`, vertical position draggable and saved in `localStorage['wpp.bubble.top']`.
  - Look (dark tokens from D7, since it sits on video): 56×56 px, radius 14 px, background `rgb(20 20 22 / 0.92)` with `backdrop-filter: blur(8px)`, 1 px `rgb(255 255 255 / 0.06)` line, the 32 px app icon, a 12 px count of participants under it; unread badge top-right in accent (`99+` cap) with accent-fg text; request badge top-left showing a small SVG for `pause | play | back | forward | resync`; status dot `success` when connected, `muted` otherwise. No pulse animation, no glow.
  - Click → `onOpen`; right-click → reveals a 20 px close button that calls `onDismiss`.
- Background: computes `BubbleState` (`visible = joined && panel closed && not dismissed for the media tab`) and sends `bg.bubble` **only to the media tab**, only when the state changes (no intervals). `content.openPanel` → `chrome.sidePanel.open({ tabId })`; `content.dismissBubble` → mark dismissed for that tab. `panel.minimize` → mark visible and the panel closes itself (`window.close()`).

- [ ] **Step 1: Write the failing tests**

```ts
it('renders and hides', () => {
  const b = createBubble(document, handlers); b.render({ visible: true, participants: 3, unread: 0, connected: true, request: null });
  const host = document.querySelector('wpp-bubble')!; expect(host.shadowRoot!.textContent).toContain('3');
  b.render({ ...state, visible: false }); expect((host as HTMLElement).style.display).toBe('none');
});
it('caps unread at 99+', () => { /* unread 120 → badge text '99+' */ });
it('shows the request badge', () => { /* request 'pause' → [data-request="pause"] present */ });
it('click opens, context menu then close dismisses', () => { /* dispatch click → onOpen; contextmenu then click close → onDismiss */ });
it('restores saved position', () => { /* localStorage 'wpp.bubble.top' = '200' → host style.top '200px' (clamped to viewport) */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): shadow-dom bubble pushed only to the media tab"`

### Task 19: Volume boost without focus stealing

**Files:**
- Create: `apps/extension/src/background/volume.ts`, `apps/extension/src/panel/volume.ts`
- Modify: `apps/extension/src/offscreen.ts`, `apps/extension/src/background/index.ts`
- Test: `apps/extension/src/panel/volume.test.ts`

**Interfaces:**
- Produces:
  - `VOLUME_MIN = 100`, `VOLUME_MAX = 300`; `percentToGain(percent: number): number` (clamped, `/100`)
  - Panel: `startOrUpdateBoost(args: { percent: number; mediaTabId: number; capturing: boolean; send: (r: PanelRequest) => Promise<PanelResponse>; getStreamId: (tabId: number) => Promise<string> }): Promise<{ ok: true } | { ok: false; message: string }>` — percent 100 → `volume.stop`; not capturing → `getStreamId` (wraps `chrome.tabCapture.getMediaStreamId({ targetTabId })`, called from the slider's change handler so it runs in a user gesture) then `volume.start`; capturing → `volume.setGain`. Failure message: `Volume boost isn't available on this tab.`
  - Background `volume.ts`: `ensureOffscreen()`, `startCapture(tabId, streamId, gain)`, `setGain(gain)`, `stopCapture()`; capture is stopped on media tab change, media tab removal, and `session.leave`. Nothing starts capture except `volume.start`. Gain is not persisted; `PublicSession.volumeGain` reports it.
  - Offscreen graph: `source → GainNode → DynamicsCompressorNode { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.25 } → destination`.

- [ ] **Step 1: Write the failing tests**

```ts
it('clamps', () => { expect(percentToGain(50)).toBe(1); expect(percentToGain(350)).toBe(3); expect(percentToGain(150)).toBe(1.5); });
it('100% stops', async () => { /* send called with { type: 'volume.stop' }, getStreamId not called */ });
it('first boost gets a stream id then starts', async () => { /* capturing false → getStreamId(7) then volume.start { tabId: 7, streamId, gain: 2 } */ });
it('while capturing only sets gain', async () => { /* capturing true → volume.setGain only */ });
it('reports unavailable tabs', async () => { /* getStreamId rejects → { ok: false, message: "Volume boost isn't available on this tab." } */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): gesture-started volume boost with limiter"`

### Task 20: Panel timeline cache and session hook

**Files:**
- Create: `apps/extension/src/lib/timeline.ts`, `apps/extension/src/panel/useSession.ts`
- Modify: `apps/extension/src/background/index.ts`
- Test: `apps/extension/src/lib/timeline.test.ts`

**Interfaces:**
- Consumes: `TimelineEntry`, `PublicSession`, `PanelRequest`, `PanelResponse`, `BackgroundEvent` (Task 14)
- Produces:
  - `entryKey(e: TimelineEntry): string` (`chat:<id>` or `sys:<kind>:<timestamp>:<userId ?? ''>`), `entryTime(e: TimelineEntry): number`
  - `mergeEntries(existing: TimelineEntry[], incoming: TimelineEntry[], cap?: number /* 200 */): TimelineEntry[]` — dedupe by key, sort by time (stable), keep the newest `cap`.
  - `ENTRIES_KEY = 'wpp.entries'`; background keeps `{ roomId, entries }` in `chrome.storage.session` (write debounced 500 ms), replaces on `chat.history` (merging any system entries already present), clears on leave, broadcasts `bg.entries` with the full merged list.
  - `useSession(): { session: PublicSession | null; entries: TimelineEntry[]; send: (r: PanelRequest) => Promise<PanelResponse> }` — on mount: `session.get`, read `ENTRIES_KEY` from `chrome.storage.session`, connect a `wpp-panel` port; listens for `BackgroundEvent`s.

- [ ] **Step 1: Write the failing tests**

```ts
it('dedupes and sorts', () => {
  const a = chat('1', 10), b = chat('2', 5), c = sys('join', 7);
  expect(mergeEntries([a], [b, a, c]).map(entryKey)).toEqual(['chat:2', 'sys:join:7:', 'chat:1']);
});
it('keeps the newest 200', () => { /* 250 entries → first kept has timestamp 50 */ });
it('history replace keeps local system entries', () => { /* mergeEntries(systemOnly, history) contains both */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(extension): persisted panel timeline and useSession hook"`

---
## Part D — Redesigned panel (`apps/extension/src/panel`)

### Task 21: Design tokens, theme and primitives

**Files:**
- Modify: `apps/extension/src/index.css` (rewrite), `apps/extension/tailwind.config.js` (rewrite)
- Create: `apps/extension/src/panel/theme.ts`, `apps/extension/src/panel/ui/Button.tsx`, `apps/extension/src/panel/ui/IconButton.tsx`, `apps/extension/src/panel/ui/Sheet.tsx`, `apps/extension/src/panel/ui/TextField.tsx`, `apps/extension/src/panel/ui/Avatar.tsx`
- Test: `apps/extension/src/panel/theme.test.ts`, `apps/extension/src/panel/ui/Sheet.test.tsx`, `apps/extension/src/uiRules.test.ts`

**Interfaces:**
- Produces:
  - CSS: tokens from D7 as RGB triplets on `:root[data-theme="dark"]` and `:root[data-theme="light"]` (`--bg`, `--surface`, `--surface-2`, `--line` (with alpha), `--text`, `--muted`, `--accent`, `--accent-fg`, `--success`, `--warning`, `--danger`); `body { background: rgb(var(--bg)); color: rgb(var(--text)); }`; focus ring `outline: 2px solid rgb(var(--accent)); outline-offset: 2px` on `:focus-visible`; thin neutral scrollbar.
  - Tailwind: `theme.colors` replaced (not extended) by the token names as `rgb(var(--x) / <alpha-value>)` plus `transparent` and `current`; `theme.fontSize` replaced by `meta: ['12px','16px']`, `body: ['13px','18px']`, `title: ['15px','20px']`, `display: ['20px','26px']`; `fontWeight` 400/500/600; `borderRadius` `control: '10px'`, `sheet: '14px'`, `full`; font family system stack.
  - `type ThemePref = 'system' | 'light' | 'dark'`; `resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark'`; `applyTheme(pref: ThemePref): void` (sets `data-theme`, follows `matchMedia('(prefers-color-scheme: dark)')` changes when `system`); `THEME_KEY = 'wpp.theme'` in `chrome.storage.local`.
  - `<Button variant="primary" | "secondary" | "ghost" | "danger" size="md" | "sm" loading?>` — md 36 px / sm 30 px, radius control, primary = accent bg + accent-fg text, secondary = surface-2, ghost = transparent, danger = danger text on surface-2.
  - `<IconButton label: string>` — 32 px square, `aria-label` required.
  - `<Sheet open onClose title>` — slides up from the bottom inside the panel, `surface` background, radius sheet on top corners, backdrop `rgb(0 0 0 / 0.4)`, closes on backdrop click and Escape, traps focus, returns focus to the opener.
  - `<TextField label hint? error? mono?>`, `<Avatar name color size=24|32>` (initial letter on the colour, text colour chosen for contrast).
  - `uiRules.test.ts` reads every `src/**/*.{ts,tsx,css}` and fails on: `/text-\[\d+px\]/`, `/bg-gradient-to-/`, `/shadow-\w+-\d{3}\//`, `/tracking-widest/`, `/isLightMode/`, `/#[0-9a-fA-F]{6}\b/` outside `index.css`, `bubble.ts` and the shared avatar palette. (It will fail until the old components are removed in Task 23 — so in this task, scope it to `src/panel/**` and `src/index.css`; Task 23 widens it to all of `src`.)

- [ ] **Step 1: Write the failing tests**

```ts
it('resolves theme', () => {
  expect(resolveTheme('system', true)).toBe('dark'); expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
});
it('sheet closes on Escape and restores focus', async () => {
  render(<Harness />); await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
});
it('panel code follows the UI rules', () => { expect(violations(['src/panel', 'src/index.css'])).toEqual([]); });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** (add devDep `@testing-library/user-event@^14`).
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(panel): design tokens, theme and ui primitives"`

### Task 22: Landing

**Files:**
- Create: `apps/extension/src/panel/Landing.tsx`, `apps/extension/src/panel/roomCode.ts`, `apps/extension/src/panel/activeTab.ts`
- Test: `apps/extension/src/panel/roomCode.test.ts`, `apps/extension/src/panel/Landing.test.tsx`

**Interfaces:**
- Consumes: `useSession` (Task 20), primitives (Task 21), `extractMedia`, `generateRandomName`, `sanitizeUsername`
- Produces:
  - `parseRoomCode(input: string): string | null` — returns the first `[A-Za-z0-9_-]{10}` run that follows `code:` (case-insensitive) or a `room=` query param, else the whole trimmed input if it alone matches `^[A-Za-z0-9_-]{6,32}$`, else null. Case is preserved.
  - `getActiveTab(): Promise<{ tabId: number; url?: string; title?: string } | null>`
  - `<Landing session send activeTab />` — layout and copy exactly as D7 "Landing". Name defaults to `generateRandomName().name`, shuffle via `IconButton label="New name"`. **Start a party** → `session.create { username, tabId }`; disabled with hint when `extractMedia(activeTab.url)` is null. **Join** → `session.join { roomId: parseRoomCode(code), username, tabId }`; invalid code → field error `That doesn't look like a room code.` `session.status === 'waking'` → the waking note; errors from `session.error` render under the button that caused them. Advanced → `TextField label="Server"` + Save (`server.setUrl`) + "Use default".
  - About is opened from the header `IconButton label="About"` (sheet built in Task 23; here render a placeholder prop `onAbout`).

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['Jol4I72BE4', 'Jol4I72BE4'], ['  Jol4I72BE4 ', 'Jol4I72BE4'],
  ['Join my Watch Pizza Party 🍕\nRoom code: Jol4I72BE4\nGet the extension: https://x', 'Jol4I72BE4'],
  ['https://example.com/?room=Jol4I72BE4', 'Jol4I72BE4'], ['hi', null], ['', null],
])('parseRoomCode(%j)', (input, out) => expect(parseRoomCode(input)).toBe(out));

it('disables Start on a non-video tab', () => {
  render(<Landing {...props} activeTab={{ tabId: 1, url: 'https://www.youtube.com/' }} />);
  expect(screen.getByRole('button', { name: 'Start a party' })).toBeDisabled();
  expect(screen.getByText('Open a YouTube or Netflix video first')).toBeInTheDocument();
});
it('starts a party from a video tab', async () => {
  render(<Landing {...props} activeTab={{ tabId: 9, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Song' }} />);
  expect(screen.getByText('Using: Song')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start a party' }));
  expect(props.send).toHaveBeenCalledWith({ type: 'session.create', username: expect.any(String), tabId: 9 });
});
it('shows the waking note', () => { /* session.status 'waking' → text from D7 */ });
it('rejects a bad code', async () => { /* type 'hi', click Join → "That doesn't look like a room code." and send not called */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(panel): landing redesign"`

### Task 23: Room view, sheets and the new App shell

**Files:**
- Create: `apps/extension/src/panel/App.tsx`, `apps/extension/src/panel/Room.tsx`, `apps/extension/src/panel/RoomHeader.tsx`, `apps/extension/src/panel/statusLine.ts`, `apps/extension/src/panel/MenuSheet.tsx`, `apps/extension/src/panel/PeopleSheet.tsx`, `apps/extension/src/panel/AboutSheet.tsx`, `apps/extension/src/panel/invite.ts`, `apps/extension/src/panel/donate.ts`
- Modify: `apps/extension/src/main.tsx` (render `panel/App`), `apps/extension/src/uiRules.test.ts` (scope → all of `src`)
- Delete: `apps/extension/src/App.tsx`, `apps/extension/src/components/` (all), `packages/shared/src/schemas.ts` and its legacy exports from `packages/shared/src/index.ts`
- Test: `apps/extension/src/panel/statusLine.test.ts`, `apps/extension/src/panel/invite.test.ts`, `apps/extension/src/panel/donate.test.ts`, `apps/extension/src/panel/Room.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 19–22
- Produces:
  - `type StatusLine = { tone: 'ok' | 'warn' | 'muted' | 'danger'; text: string; action?: { label: 'Use this tab' | 'Sync everyone' | 'Resync'; request: PanelRequest } }`
  - `statusLine(session: PublicSession, activeTabId: number | null): StatusLine` — exact copy from D7 "Status line copy". Precedence: `reconnecting` → no media tab → host (with **Sync everyone** when any participant status is `drifting`) → viewer by `mySync` (`synced` → In sync/ok, `drifting` → Catching up…/warn + **Resync**, `ad` → You're in an ad/muted, `buffering` → Buffering…/muted, `paused` → Paused/muted; when the timeline is in an ad (`room.timeline?.inAd`) → Waiting for the host's ad/muted).
  - `inviteText(roomId: string, extensionId: string): string` →
    ```
    Join my Watch Pizza Party 🍕
    Room code: <roomId>
    Get the extension: https://chromewebstore.google.com/detail/<extensionId>
    ```
  - `whatsappUrl(text)`, `mailtoUrl(text)` (subject `Watch Pizza Party invite`).
  - `DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG'`; `shouldShowDonatePrompt(args: { joinedAtMs: number; nowMs: number; nextAllowedAtMs: number | null }): boolean` — true when ≥ 30 min in the party and `now ≥ nextAllowedAt` (null = allowed); dismissing or clicking sets next allowed to now + 7 days (`chrome.storage.local['wpp.donate.nextAt']`). The prompt is a local timeline entry rendered by `Chat` (Task 24) as a system-style row with a **Donate a slice** link.
  - `Room` layout (D7 "Room"): `RoomHeader` (room code chip → copies, shows `Copied` for 1.4 s; avatar stack up to 4 + `+N` → `PeopleSheet`; `IconButton label="Menu"` → `MenuSheet`), status line row (dot coloured by tone + text + optional small Button), now-playing row (`room.timeline?.title` or `Nothing playing yet`), then `<Chat>` (Task 24), filling the rest.
  - `MenuSheet` sections in order: **Invite** (Copy code, Copy invite, WhatsApp, Email), **Sync** (host: Sync everyone now → `sync.force`; viewer: Resync me → `sync.resyncMe`, and Ask host to: Pause / Play / Back / Forward → `sync.request`), **Volume boost** (range 100–300 %, step 10, label `Volume boost 150%`, inline error from Task 19), **Appearance** (theme segmented control System / Light / Dark; Chat sounds switch, `wpp.sounds` in `chrome.storage.local`, default on), **Support Watch Pizza Party** (opens `DONATE_URL`), **About & guide** (→ `AboutSheet`), **Minimize to bubble** (`panel.minimize` then `window.close()`), **Leave party** (danger, confirms inline "Leave the party?" Leave / Stay).
  - `PeopleSheet`: one row per participant — `Avatar`, name, `You` tag for `me.userId`, `Host` tag, status text (`In sync`, `Catching up`, `Buffering`, `In an ad`, `Paused`, `Reconnecting`, `—`).
  - `AboutSheet`: what it is (one sentence), How it works (3 numbered steps: open a video and start a party; share the code; everyone stays in sync — the host controls playback), privacy line ("Chat and room state live in server memory only and disappear when the room closes. GIF searches go through our server to Giphy."), version from `chrome.runtime.getManifest().version`, credits.
  - `App`: `useSession()` + `applyTheme` on mount; `session.status in ['idle','error'] && !session.room` → `Landing`; `connecting` → a small centered spinner + "Joining…" + Cancel (`session.leave`); otherwise `Room`.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['reconnecting', { status: 'reconnecting' }, { tone: 'warn', text: 'Reconnecting…' }],
  ['no tab', { mediaTab: null }, { tone: 'warn', text: 'Pick a tab to watch in', action: { label: 'Use this tab' } }],
  ['host', { isHost: true }, { tone: 'ok', text: "You're the host" }],
  ['host + drifting viewer', { isHost: true, driftingViewer: true }, { action: { label: 'Sync everyone' } }],
  ['viewer synced', { mySync: 'synced' }, { tone: 'ok', text: 'In sync' }],
  ['viewer drifting', { mySync: 'drifting' }, { tone: 'warn', text: 'Catching up…', action: { label: 'Resync' } }],
  ['host in ad', { timelineInAd: true }, { tone: 'muted', text: "Waiting for the host's ad" }],
  ['own ad', { mySync: 'ad' }, { tone: 'muted', text: "You're in an ad" }],
])('statusLine %s', (_n, overrides, expected) => expect(statusLine(sessionWith(overrides), 1)).toMatchObject(expected));

it('invite text', () => expect(inviteText('Jol4I72BE4', 'abc')).toBe(
  'Join my Watch Pizza Party 🍕\nRoom code: Jol4I72BE4\nGet the extension: https://chromewebstore.google.com/detail/abc'));
it('donate prompt after 30 min, then weekly', () => {
  expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 29 * 60_000, nextAllowedAtMs: null })).toBe(false);
  expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 30 * 60_000, nextAllowedAtMs: null })).toBe(true);
  expect(shouldShowDonatePrompt({ joinedAtMs: 0, nowMs: 31 * 60_000, nextAllowedAtMs: 40 * 60_000 })).toBe(false);
});
it('room view puts chat first and hides settings in the menu', () => {
  render(<Room {...roomProps} />);
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  expect(screen.queryByText(/Volume boost/)).toBeNull();
  // open menu → Volume boost visible
});
it('leave asks for confirmation', async () => { /* Menu → Leave party → "Leave the party?" → Leave → send({type:'session.leave'}) */ });
it('UI rules hold for all of src', () => expect(violations(['src'])).toEqual([]));
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement**, delete the old UI and the legacy shared schemas.
- [ ] **Step 4: Run tests and build** — `npm test && npm run build:extension && npm run build:server` → all green. `grep -rn "schemas'" apps packages --include=*.ts --include=*.tsx` → no matches.
- [ ] **Step 5: Commit** — `git add apps/extension packages/shared && git commit -m "feat(panel): chat-first room view, sheets, new app shell"`

### Task 24: Chat

**Files:**
- Create: `apps/extension/src/panel/Chat.tsx`, `apps/extension/src/panel/chatModel.ts`, `apps/extension/src/panel/gifs.ts`, `apps/extension/src/panel/Composer.tsx`, `apps/extension/src/panel/GifPicker.tsx`, `apps/extension/src/panel/EmojiPicker.tsx`, `apps/extension/src/panel/sounds.ts`
- Test: `apps/extension/src/panel/chatModel.test.ts`, `apps/extension/src/panel/Chat.test.tsx`, `apps/extension/src/panel/gifs.test.ts`

**Interfaces:**
- Consumes: `TimelineEntry` (Task 14), `isAllowedGifUrl` (Task 1), server `GET /gifs` (Task 11)
- Produces:
  - `type ChatRow = { kind: 'group'; userId: string; username: string; avatarColor: string; mine: boolean; messages: ChatMessage[] } | { kind: 'system'; key: string; text: string; timestamp: number } | { kind: 'donate'; key: string }`
  - `groupEntries(entries: TimelineEntry[], meUserId: string | null, opts?: { donate?: boolean }): ChatRow[]` — consecutive chat messages from the same **userId** within 3 minutes form one group; system events break groups; the donate row (when `opts.donate`) is appended last.
  - `gifFromText(text: string): string | null` — the trimmed text if it is a single URL that passes `isAllowedGifUrl`, else null.
  - `fetchGifs(serverUrl: string, q: string, fetchImpl?: typeof fetch): Promise<Gif[] | 'unavailable'>` (`503` → `'unavailable'`).
  - `<Chat entries meUserId soundsEnabled onSend serverUrl donate onDonateClose />`:
    - Group row: 24 px `Avatar`, name (body, 600, `text` colour) + time (meta, muted) once per group, messages (body) beneath; own groups show name "You". GIF messages render `<img>` (max-height 160 px, radius control, `alt="GIF"`, `loading="lazy"`, `referrerPolicy="no-referrer"`); every other message renders as plain text (`whitespace-pre-wrap break-words`).
    - System row: centered, meta size, muted, single line.
    - Auto-scrolls to bottom when already near the bottom; otherwise shows a "New messages" pill.
    - Composer: `textarea aria-label="Message"` auto-growing 1–4 lines, Enter sends, Shift+Enter newline, counter `n/500` visible from 450, send `IconButton label="Send"`; emoji `IconButton label="Emoji"` (the existing 36 emoji grid); GIF `IconButton label="GIF"` hidden when `fetchGifs` returned `'unavailable'` (probe once per panel open with `q=''`).
    - Receive tone (existing oscillator, gain 0.028) when `soundsEnabled` and the message is not mine.

- [ ] **Step 1: Write the failing tests**

```ts
it('groups by userId, not name (same-name regression)', () => {
  const rows = groupEntries([msg('u1', 'Marco', 0), msg('u2', 'Marco', 1000), msg('u2', 'Marco', 2000)], 'u2');
  expect(rows.map((r) => r.kind === 'group' && [r.userId, r.mine, r.messages.length])).toEqual([['u1', false, 1], ['u2', true, 2]]);
});
it('splits groups after 3 minutes and around system events', () => { /* … */ });
it('only giphy urls become gifs', () => {
  expect(gifFromText('https://media2.giphy.com/media/a/200.gif')).toBe('https://media2.giphy.com/media/a/200.gif');
  expect(gifFromText('https://evil.com/track.gif')).toBeNull();
  expect(gifFromText('look https://media2.giphy.com/media/a/200.gif')).toBeNull();
});
it('renders a non-giphy image url as text, never as <img>', () => {
  render(<Chat {...props} entries={[msg('u1', 'Luca', 0, 'https://evil.com/track.gif')]} />);
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText('https://evil.com/track.gif')).toBeInTheDocument();
});
it('Enter sends, Shift+Enter adds a newline', async () => { /* type 'hi{Shift>}{Enter}{/Shift}there{Enter}' → onSend('hi\nthere') */ });
it('hides the GIF button when the server has no key', async () => { /* fetch 503 → no button named GIF */ });
it('fetchGifs maps 503 to unavailable', async () => { /* fetchImpl returns 503 → 'unavailable' */ });
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** and mount `<Chat>` in `Room`.
- [ ] **Step 4: Run tests and build** — PASS / exit 0.
- [ ] **Step 5: Commit** — `git add apps/extension && git commit -m "feat(panel): grouped chat, safe gifs via server proxy"`

---

## Part E — Verification and release

### Task 25: End-to-end sync test in a real browser

**Files:**
- Create: `e2e/package.json` (workspace `@watch-party/e2e`, devDeps `@playwright/test@^1.55`, script `"e2e": "playwright test"`; **no** `test` script so `npm test` stays fast), `e2e/playwright.config.ts`, `e2e/fixtures.ts`, `e2e/sync.spec.ts`, `e2e/screens.spec.ts`
- Modify: root `package.json` (workspace `e2e`, script `"e2e": "npm run e2e --workspace=@watch-party/e2e"`), `.gitignore` (`e2e/test-results/`, `e2e/playwright-report/`)

**Interfaces:**
- Consumes: `createApp` (Task 5), the built extension.
- Produces:
  - `globalSetup`: runs `npm run build:server`, builds the extension with `VITE_SERVER_URL=http://127.0.0.1:3105`, then starts `createApp()` imported from `apps/server/dist/app.js` on port 3105 (teardown closes it).
  - Fixture `party()`: two `chromium.launchPersistentContext('', { channel: 'chromium', args: ['--disable-extensions-except=<dist>', '--load-extension=<dist>', '--autoplay-policy=no-user-gesture-required'] })`, each with cookie `SOCS=CAI` on `.youtube.com` (skips the EU consent page), returns `{ host, viewer }` each with `{ context, extensionId, page /* the YouTube tab */, panel /* chrome-extension://<id>/index.html in its own tab */ }`.
  - Panel requests are sent from the panel page with `chrome.runtime.sendMessage` (`session.create` / `session.join` with the YouTube tab's id found via `chrome.tabs.query({ url: '*://*.youtube.com/*' })`).
  - `waitNoAd(page)`: waits up to 60 s for `#movie_player` to not have `ad-showing` (clicks `.ytp-skip-ad-button` when present).
  - `driftBetween(a: Page, b: Page): Promise<number>` — reads `video.currentTime` on both pages in parallel 5 times and returns the median of `|a − b|`.
  - Test video: `https://www.youtube.com/watch?v=aqz-KE-bpKQ` (Big Buck Bunny, CC-BY).

- [ ] **Step 1: Write the E2E tests**

```ts
test('viewer follows host play, seek and pause', async ({ party }) => {
  const { host, viewer } = party;
  await host.page.goto(VIDEO); const room = await createParty(host);           // session.create
  await viewer.page.goto('about:blank'); await joinParty(viewer, room.roomId);  // session.join → background navigates the viewer tab
  await expect(viewer.page).toHaveURL(/watch\?v=aqz-KE-bpKQ/, { timeout: 15_000 });
  await waitNoAd(host.page); await waitNoAd(viewer.page);
  await host.page.evaluate(() => document.querySelector('video')!.play());
  await expect.poll(() => isPlaying(viewer.page), { timeout: 8_000 }).toBe(true);
  await expect.poll(() => driftBetween(host.page, viewer.page), { timeout: 10_000 }).toBeLessThan(0.5);
  await host.page.evaluate(() => { document.querySelector('video')!.currentTime = 120; });
  await expect.poll(() => driftBetween(host.page, viewer.page), { timeout: 8_000 }).toBeLessThan(1.0);
  await host.page.evaluate(() => document.querySelector('video')!.pause());
  await expect.poll(() => isPlaying(viewer.page), { timeout: 4_000 }).toBe(false);
  expect(await driftBetween(host.page, viewer.page)).toBeLessThan(0.3);
});
test('viewer joining later gets chat history', async ({ party }) => { /* host sends chat.send, viewer joins, panel shows the message */ });
test('closing the viewer media tab navigates nothing else', async ({ party }) => {
  /* viewer opens a second tab at https://example.com, closes the YouTube tab, host seeks;
     after 3s the example.com tab URL is unchanged and the panel status says "Pick a tab to watch in" */
});
```

`screens.spec.ts`: sets the panel page viewport to 400×800 and saves `e2e/screenshots/{landing,landing-light,room-host,room-viewer,menu,people}.png` (light variant via `chrome.storage.local.set({ 'wpp.theme': 'light' })` then reload).

- [ ] **Step 2: Run them**

Run: `npx playwright install chromium && npm run e2e`
Expected: 3 sync tests + screens PASS. Configure `retries: 1` (YouTube ads can be flaky). If a test fails, use superpowers:systematic-debugging before changing controller constants — the constants are spec values (D5).

- [ ] **Step 3: Review the screenshots against D7** (one accent, no text under 12 px, chat visible on open, no gradients/glows). Fix deviations in the owning task's files, re-run.
- [ ] **Step 4: Commit** — `git add e2e package.json package-lock.json .gitignore && git commit -m "test(e2e): real-browser youtube sync and panel screenshots"`

### Task 26: Docs, privacy, packaging and rollout

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `PRIVACY_POLICY.md`, `STORE_LISTING.md`, `DEPLOYMENT_GUIDE.md`, `SUBMISSION_CHECKLIST.md`, root `package.json` (version `2.0.0`, script `"package:extension"`)
- Create: `scripts/package-extension.mjs`, `docs/QA_CHECKLIST.md`
- Delete: `api.giphy.com` (empty file at repo root), `apps/extension/postcss.config.js` only if unused (keep if Tailwind needs it)

**Interfaces:** none new.

Content requirements:
- `CLAUDE.md`: architecture v2 (folders from D6, protocol v2, server `RoomStore`, sync model), commands (`npm test`, `npm run e2e`, builds, `VITE_SERVER_URL`), env vars, and an accurate compliance statement: *"A MAIN-world script (`player-bridge.js`) calls the YouTube and Netflix player APIs for play/pause/seek; the extension adds a floating bubble to the page. It does not touch DRM/EME, does not download or capture video, and only captures tab audio when the user turns on volume boost."*
- `PRIVACY_POLICY.md`: add Giphy (searches proxied through our server; images load from Giphy's CDN, which sees your IP), room tokens (random, stored in the browser, deleted after 8 h), chat history (last 100 messages per room in server memory, deleted when the room closes ~30 min after everyone leaves), volume boost (audio processed locally, never sent anywhere).
- `STORE_LISTING.md`: replace "perfect synchronization" claims with "stays in sync automatically"; list 2.0 changes.
- `DEPLOYMENT_GUIDE.md` rollout (D1): (1) create a **new** Render web service `watch-pizza-party-v2` from `apps/server/Dockerfile`, env `GIPHY_API_KEY` (a **new** key — the old one in v1.2 is public; revoke it in the Giphy dashboard after v2 is live), optional `ALLOWED_ORIGINS`; (2) `VITE_SERVER_URL=https://watch-pizza-party-v2.onrender.com npm run package:extension`; (3) upload `release/watch-pizza-party-2.0.0.zip`; (4) keep the v1 service running for 14 days after the store update is live, then delete it. Note that a paid instance (or Fly.io/Cloudflare) removes cold starts.
- `scripts/package-extension.mjs`: runs the extension build, then zips `apps/extension/dist` (excluding `.DS_Store`) to `release/watch-pizza-party-<manifest version>.zip`; add `release/` to `.gitignore`.
- `docs/QA_CHECKLIST.md`: manual checks the E2E can't cover — Netflix host + viewer (play/pause/seek/episode change), Netflix ads tier, kill the service worker (`chrome://serviceworker-internals` → Stop) mid-party on host and viewer, two people with the same name, close the media tab, minimize to bubble and restore, volume boost on/off, light/dark/system theme, fullscreen bubble, incognito.

- [ ] **Step 1: Write the docs and the packaging script.**
- [ ] **Step 2: Package**

Run: `npm run package:extension && unzip -l release/watch-pizza-party-2.0.0.zip`
Expected: zip listing contains `manifest.json`, `background.js`, `content.js`, `player-bridge.js`, `offscreen.js`, `index.html`, `assets/…`, icons; no `.ts`, no `.DS_Store`, no `popup.html`.

- [ ] **Step 3: Full verification**

Run: `npm test && npm run build:server && npm run build:extension && npm run e2e`
Expected: all green.

- [ ] **Step 4: Commit** — `git add CLAUDE.md README.md PRIVACY_POLICY.md STORE_LISTING.md DEPLOYMENT_GUIDE.md SUBMISSION_CHECKLIST.md package.json scripts docs .gitignore && git rm -q api.giphy.com && git commit -m "docs: v2 architecture, privacy, rollout and QA checklist"`
