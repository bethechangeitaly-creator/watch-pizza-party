# Panel Redesign ("Warm & friendly") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the side panel to the approved warm light / Dark wine night design, bring 1.2's working controls back in foldable sections, and restore the toolbar popup.

**Architecture:** Only the extension's UI layer changes: tokens in `src/index.css` + `tailwind.config.js`, components in `src/panel/`, a new `src/popup/`, the bubble's CSS. The background gains one panel request (`volume.arm`) and stops opening the panel on icon click. Sync, protocol and server stay untouched.

**Tech Stack:** React 18, Tailwind 3, Vite 5, Vitest + Testing Library (jsdom), `@fontsource/nunito`, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-11-panel-redesign-design.md`

## Global Constraints

- Token values exactly as in the spec's table (incl. `accent-strong #C9461F` and light `muted #76665C`). Body text ≥ 4.5:1 in both themes.
- No text under 12 px, no arbitrary `text-[Npx]`, no gradients, no coloured glow shadows, no uppercase letter-spaced labels; `src/uiRules.test.ts` keeps enforcing this (add `/uppercase/` to its rules).
- No new manifest permissions (`check-dist` enforces).
- `npm test` green after every task; `npm run build:extension` green after every task; `npm run e2e` green at the end.
- Branch `v2-overhaul`; commit per task, explicit paths; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Night theme in a dark room** — no large bright surfaces; the night palette must also apply to sheets, popup and bubble. Pinned by the token contrast test (Task 1) and screenshot review (Task 8).
2. **Everything unfolded on a short panel** — chat and composer stay visible. Pinned in Task 3 (`controls area is capped and scrolls`).
3. **Viewer vs host** — the Sync section shows the right buttons for each; the request buttons only for viewers. Pinned in Task 3.
4. **Popup when no party / in a party / panel already open** — Open buttons work, and volume arms. Pinned in Task 6.
5. **Same-name friends** — tints and "You" by userId (existing chatModel tests keep passing; Task 4 adds tint tests).

---

### Task 1: Tokens, font and contrast guard

**Files:** Modify `src/index.css`, `tailwind.config.js`, `src/main.tsx`, `src/uiRules.test.ts`, `package.json` (dep `@fontsource/nunito@^5`). Create `src/tokens.test.ts`.

**Produces:** Tailwind colour names `bg, surface, surface-2, line, text, muted, accent, accent-strong, accent-fg, cheese, cheese-fg, ok, ok-fg, warn, warn-fg, bad, bad-fg, invite, invite-fg, wa, wa-fg, mail, mail-fg, scrim`, all `rgb(var(--x) / <alpha-value>)` except `line`; font family `sans` = Nunito first. `theme.ts` unchanged (light/dark data-theme).

- [ ] **Step 1: Failing tests**

```ts
// tokens.test.ts — parses src/index.css
it('defines every token in both themes', () => { /* for each name above (minus scrim), light and dark blocks contain --name */ });
it.each([['text','bg'],['muted','bg'],['muted','surface-2'],['ok-fg','ok'],['cheese-fg','cheese'],['invite-fg','invite'],['wa-fg','wa'],['mail-fg','mail'],['bad-fg','bad'],['warn-fg','warn']])
  ('%s on %s ≥ 4.5:1 in both themes', (fg, bg) => { /* WCAG contrast from the RGB triplets */ });
it('white on accent-strong ≥ 4.5:1', () => {});
// uiRules.test.ts: add /\buppercase\b/ and /tracking-wid/ rules
```

- [ ] **Step 2: Run** `npm test --workspace=@watch-party/extension` → FAIL (missing tokens).
- [ ] **Step 3: Implement** the token blocks from the spec table (RGB triplets), the Tailwind mapping, `import '@fontsource/nunito/400.css'` (+600/700/800) in `main.tsx` and the popup entry later.
- [ ] **Step 4: Run** tests + `npm run build:extension` → PASS / `dist ok`.
- [ ] **Step 5: Commit** `feat(panel): warm & dark-wine tokens, Nunito, contrast guard`

### Task 2: Foldable section + remembered state

**Files:** Create `src/panel/ui/Section.tsx`, `src/panel/sections.ts`, tests `src/panel/ui/Section.test.tsx`, `src/panel/sections.test.ts`.

**Produces:**
- `type SectionId = 'invite' | 'sync' | 'people' | 'volume'`
- `defaultSections(role: 'host' | 'viewer'): Record<SectionId, boolean>` → host `{invite:true, sync:true, people:false, volume:false}`, viewer `{invite:false, sync:true, people:false, volume:false}`
- `SECTIONS_KEY = 'wpp.sections'`; `mergeSections(stored: unknown, role): Record<SectionId, boolean>` (stored booleans win, junk ignored)
- `<Section id title open onToggle badge?>` — card (`bg-surface rounded-[16px]`→ use `rounded-card` radius token 16 px), header button with `aria-expanded`, chevron rotates, children only when open.

- [ ] **Step 1: Failing tests** — defaults per role; `mergeSections({ people: true, x: 1 }, 'viewer').people === true`; Section toggles `aria-expanded` and hides children.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (add `borderRadius.card: '16px'` to Tailwind). **Step 4: Run** → PASS. **Step 5: Commit** `feat(panel): foldable sections with remembered state`

### Task 3: Room screen rebuilt

**Files:** Rewrite `src/panel/Room.tsx`, `src/panel/RoomHeader.tsx`, `src/panel/MenuSheet.tsx`; delete `src/panel/PeopleSheet.tsx`; update `src/panel/App.tsx`, `src/panel/Room.test.tsx`.

**Consumes:** Section/sections (Task 2), `statusLine`, `invite.ts`, `volume.ts` (`setBoost`), `DONATE_URL`, theme helpers.

**Produces (layout per spec §3):**
- Header: code chip (cheese) + connection dot (`ok` when `status==='joined'`, `muted` connecting, `bad` when `error`), avatar stack, IconButtons **Minimize to bubble**, **Chat sounds**, **Theme** (cycles system→light→dark, label "Theme: System|Light|Night"), **Leave** (inline confirm row "Leave the party?" Leave/Stay under the header), **Menu**.
- You row (Avatar 32, name, Host tag cheese / Viewer tag invite colours).
- Status pill coloured by tone (`ok/warn/bad` pairs, muted → surface-2) + action Button.
- Now playing line.
- Sections: **Invite friends** (3 buttons in invite / wa / mail colours), **Sync** (host: 🔄 Sync everyone [cheese]; viewer: 🔄 Resync me + "Ask the host to:" Back/Pause/Play/Forward; both: 🍕 Donate a slice [bad-pair soft tomato] opening `DONATE_URL`), **People (N)** (rows: Avatar, name, You, Host tag, status text — moved from PeopleSheet), **Volume boost** (slider 100–300 step 10, value right, error line, double-click resets to 100 via `setBoost(100)`).
- Controls area (header excluded) `max-h-[55%] overflow-y-auto` *(arbitrary size classes other than text are allowed)*; chat `min-h-[40%] flex-1`.
- MenuSheet: About & guide, Donate a slice, server address (read-only text) — nothing else.
- Section open state loaded from `chrome.storage.local[SECTIONS_KEY]` in App and passed down (`sections`, `onToggleSection`) so Room stays chrome-free for tests.
- Remove the donate-prompt-in-chat wiring from App/Chat (`shouldShowDonatePrompt` and its test removed with `donate.ts` reduced to `DONATE_URL`).

- [ ] **Step 1: Failing tests (Room.test.tsx, rewritten)**

```tsx
it('host sees invite open, sync open, people/volume folded', () => { /* buttons Copy invite, WhatsApp, Email, Sync everyone visible; slider not in DOM */ });
it('viewer sees Resync me and the ask-the-host buttons', async () => { /* click Pause → send({type:'sync.request', reason:'pause'}) */ });
it('folding a section reports the toggle', async () => { /* click "Invite friends" header → onToggleSection('invite') */ });
it('leave asks for confirmation in the header', async () => { /* Leave → "Leave the party?" → Leave → send session.leave */ });
it('theme button cycles system → light → dark', async () => { /* onThemeChange called with 'light' then 'dark' */ });
it('people section lists names with You and Host', async () => { /* open People → Luca, You, Marco, Host */ });
it('volume slider double-click resets to 100%', async () => { /* open Volume, dblclick slider → send({type:'volume.set', gain:1}) */ });
it('controls area is capped and scrolls', () => { /* region "Party controls" has class max-h-[55%] and overflow-y-auto; textbox Message present */ });
it('donate opens the PayPal page', async () => { /* window.open called with DONATE_URL */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** tests + build → PASS. **Step 5: Commit** `feat(panel): 1.2 controls back in foldable sections`

### Task 4: Chat restyle with friend tints

**Files:** Modify `src/panel/Chat.tsx`, `src/panel/Composer.tsx`, `src/panel/chatModel.ts`; tests `src/panel/chatModel.test.ts`, `src/panel/Chat.test.tsx`.

**Produces:** `bubbleTint(hex: string, theme: 'light' | 'dark'): { background: string; name: string }` — background = avatar colour mixed into the theme bg (light 15 %, dark 22 %); name colour = avatar colour darkened (light) / lightened (dark) until ≥ 4.5:1 on bg. Own messages: `bg-accent-strong text-accent-fg`. Others: bubble in tint with `text` colour. System entries: pill `bg-surface-2 text-muted` centered. Bubble radius 16 px with 5 px sender corner. Composer: `bg-surface-2` input, send button `accent-strong`. Chat receives `theme` prop (resolved theme) from App.

- [ ] **Step 1: Failing tests** — for every `AVATAR_PALETTE` colour and both themes: contrast(text token, tint.background) ≥ 4.5 and contrast(tint.name, bg) ≥ 4.5; Chat renders own bubble with class `bg-accent-strong`.
- [ ] **Step 2–4:** run FAIL → implement → PASS (+ build). **Step 5: Commit** `feat(panel): tinted chat bubbles and warm composer`

### Task 5: Landing restyle + "How it works"

**Files:** Modify `src/panel/Landing.tsx`, `src/panel/AboutSheet.tsx`, `src/panel/ui/{Button,IconButton,TextField,Sheet}.tsx`; test `src/panel/Landing.test.tsx`.

**Produces:** Buttons use new tokens (primary = `accent-strong`, secondary = `surface-2`); Landing header logo in rounded square, display line, visible link **How it works** calling `onAbout`; waking note uses `warn` pair, errors `bad` pair, as soft notes (`rounded-[12px] px-3 py-2`).

- [ ] **Step 1: Failing test** — `click "How it works" → onAbout called`; existing Landing tests stay.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(panel): warm landing with how-it-works link`

### Task 6: Toolbar popup

**Files:** Create `apps/extension/popup.html`, `src/popup/main.tsx`, `src/popup/Popup.tsx`, test `src/popup/Popup.test.tsx`. Modify `vite.config.mjs` (entry `popup`), `manifest.json` (`action.default_popup: "popup.html"`), `src/lib/messages.ts` (`PanelRequest += { type: 'volume.arm'; tabId: number }`), `src/background/index.ts` (route `volume.arm` → `armVolumeIfAllowed(tabId)` only when `tabId === mediaTab`; `setPanelBehavior({ openPanelOnActionClick: false })`; add to `PANEL_REQUEST_TYPES`).

**Produces:** `<Popup session send openPanel activeTab />`:
- no party: logo, "Watch Pizza Party", "Watch YouTube & Netflix together", primary **Open Watch Pizza Party**;
- in party: rows You (name + Host/Viewer tag), Room (code + copy-invite IconButton "Copy invite"), Watching (N people), connection dot; primary **Open full sidebar**.
- On mount, when in a party and `activeTab.tabId === session.mediaTab.tabId`, sends `volume.arm`.
- `openPanel` = `chrome.sidePanel.open({ windowId })` then `window.close()` (called from the click → user gesture).
- 300 px wide, warm tokens, same theme handling (`applyTheme(loadThemePref())`), does **not** open a `wpp-panel` port.

- [ ] **Step 1: Failing tests** — no-party state shows "Open Watch Pizza Party" and calls `openPanel` on click; party state shows name, Host tag, code, "2 people"; arms volume when on the media tab and not otherwise.
- [ ] **Step 2–4:** FAIL → implement → PASS; build: `dist/popup.html` exists, `check-dist` ok.
- [ ] **Step 5: Commit** `feat(extension): toolbar popup is back`

### Task 7: Bubble in the night palette

**Files:** Modify `src/content/bubble.ts` (CSS only: surface `#24141A` at 92 %, line `rgb(255 255 255 / 7%)`, text `#F5E9E4`, muted `#B39A94`, ok `#6EE7A4`, unread badge `#C9461F` + white, Nunito via system fallback `ui-rounded, ui-sans-serif`); existing bubble tests stay green.

- [ ] Steps: run bubble tests → adjust CSS → run → commit `style(content): bubble in dark-wine palette`

### Task 8: Screenshots, full verification, test build

**Files:** Modify `e2e/screens.spec.ts` (shots: `popup-party`, `room-host-light`, `room-host-night`, `room-viewer-light`, `room-all-open-short` at 400×600 with all sections open).

- [ ] **Step 1:** Run `npm test && npm run build:server && npm run build:extension && npm run e2e` → all green.
- [ ] **Step 2:** Review the screenshots against the spec (tokens, no tiny text, chat visible when all open, night has no bright areas). Fix in the owning task's files, re-run.
- [ ] **Step 3:** Rebuild the test extension for the test server: `VITE_SERVER_URL=https://wpp-test-yi8q.onrender.com npm run build:extension`, then sync `apps/extension/dist/` into `release/test-extension/` and `release/watch-pizza-party-2.0.0-TEST/` (excluding store artwork) and re-zip `release/watch-pizza-party-2.0.0-TEST.zip`.
- [ ] **Step 4: Commit** `test(e2e): screenshots for the warm redesign` and push the branch.
