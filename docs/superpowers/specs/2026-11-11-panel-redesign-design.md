# Watch Pizza Party 2.0 — Panel redesign ("Warm & friendly")

Follows `2026-11-11-watch-party-v2-design.md`. That design's D7 (neutral tokens, chat-first room with almost everything behind a ⋯ menu, no popup) is **replaced** by this document. Everything else in v2 (protocol, sync, security, server) is unchanged.

## Why

Testing the 2.0 build, the owner found it "bland", "without soul", and missing controls they relied on in 1.2. The 1.2 light mode was colourful and had everything at hand. 2.0 hid most of it in a menu and dropped the toolbar popup. The goal is a design that keeps 1.2's warmth and "everything visible" feel, without what made 1.2 look generated: tiny uppercase labels, glowing gradients, and seven competing button colours with no meaning.

## Goals

- Warm, friendly, clearly "pizza". The personality comes from colour and small touches, matching the app icon (cartoon pizza slice, cheese yellow, tomato red, crust orange).
- **Every 1.2 control that still does something is back on screen, restyled.** Nothing useful hides behind a menu.
- The toolbar **popup** is back.
- A **night theme** that doesn't light up the user's face while watching a film.
- Readable: text ≥ 12 px, body 13–14 px, good contrast in both themes.

## Non-goals

- No changes to sync, protocol, server or permissions.
- No new features beyond the ones listed here.

## Anti-goals (it fails if…)

- …it looks grey and empty again, or the chat is the only thing on screen.
- …a control appears that does nothing, or a 1.2 control that worked silently disappears.
- …the dark theme is bright or saturated enough to glow in a dark room.
- …the old "AI" look comes back: glowing coloured shadows, gradient buttons, uppercase letter-spaced micro-labels.

## Decided with the owner

- **Style C · Warm & friendly** for light, **Night 1 · Dark wine** for dark (mockups in `.superpowers/brainstorm/…/content/c-light-and-night.html`).
- Main controls on the room screen, in **foldable sections like 1.2** (owner chose this over the mockup's always-open layout): invite (copy / WhatsApp / email), sync, people, volume, plus donate and the chat.
- "Everything from 1.2 that is needed and working comes back, with a refreshed style", including the opening popup.

## Visual system

**Font:** Nunito (400/600/700/800), bundled with the extension. *Builder's call: use the `@fontsource/nunito` package; no runtime request to Google.*

**Theme:** follows the OS by default; the user can force Light or Night (stored, as today).

| token | Light | Night (Dark wine) |
|---|---|---|
| bg | `#FFFBF5` | `#1A0E0F` |
| surface (cards, sheets, popup) | `#FFFFFF` | `#24141A` |
| surface-2 (inputs, soft fills, system pills) | `#F5EDE3` | `#2A1719` |
| line (hairline) | `rgb(0 0 0 / 8%)` | `rgb(255 255 255 / 7%)` |
| text | `#2B2420` | `#F5E9E4` |
| muted | `#76665C` *(mockup had `#8C7B70`; darkened to 5.3:1 — builder's call, see Contrast)* | `#B39A94` |
| accent (tomato orange — fills without text, slider, dots, icons) | `#F26B3A` | `#F26B3A` |
| accent-strong (fills with white text: primary buttons, your chat bubbles, send; accent-coloured text/links in light) | `#C9461F` | `#C9461F` (fills) / `#F26B3A` (text on night bg) |
| accent-fg | `#FFFFFF` | `#FFFFFF` |
| cheese (room code chip, sync) | bg `#FFE9C7` / fg `#8A4B12` | bg `#3A2614` / fg `#FFC58A` |
| success (in sync) | bg `#E7F8EE` / fg `#16804D` | bg `#16301F` / fg `#6EE7A4` |
| warning | bg `#FFF3D6` / fg `#8A5A00` | bg `#3A2A10` / fg `#F5C26B` |
| danger | bg `#FDE7DF` / fg `#B5421B` | bg `#3A1A16` / fg `#FF9A7A` |
| invite blue | bg `#E3F3FD` / fg `#1A6C97` | bg `#14283A` / fg `#8CCBF5` |
| whatsapp green | bg `#E2F7EC` / fg `#16804D` | bg `#132D20` / fg `#7BE3A8` |
| email purple | bg `#EFEBFF` / fg `#5A47D6` | bg `#231D3F` / fg `#B9ADFF` |

Colour carries meaning: each invite channel has its own soft colour; sync is cheese yellow; donate is soft tomato; "in sync" is green; your own chat messages are solid tomato orange with white text. Each friend's bubble is tinted with their avatar colour: the avatar hex at about 15% opacity on the theme background (light) or about 22% (night), with the name in the avatar colour (lightened in night). *The exact tint math is the builder's call; it must keep body-text contrast ≥ 4.5:1.*

**Contrast (builder's call, from the reviewer check):** the mockup's `#F26B3A` with white text is only 3.0:1, so text-bearing fills use `accent-strong` `#C9461F` (white on it 4.8:1; as text on cream 4.65:1); bright `#F26B3A` stays for non-text accents. All body text ≥ 4.5:1 in both themes.

**Shapes:** rounded (controls 12 px, cards 16 px, bubbles 16 px with one 5 px corner on the sender side, pills fully round). Buttons are flat fills, with no gradients and no coloured shadows. Cards may use a soft neutral shadow in light (`0 1px 3px rgb(120 60 20 / 8%)`) and none in night. Section titles are sentence case at 12–13 px, weight 700, muted, never uppercase or letter-spaced. Emoji are welcome in content and in a few button labels (🔗, 🔄, 🍕), but every button must read fine without its emoji.

## Screens

### 1. Toolbar popup (back)

Clicking the toolbar icon opens a popup (~300 px wide), not the side panel.

- **No party:** logo + "Watch Pizza Party", one line "Watch YouTube & Netflix together", primary button **Open Watch Pizza Party** (opens the side panel).
- **In a party:**
  - rows "You" (name + Host/Viewer tag), "Room" (code with a copy-invite button), "Watching" (N people);
  - connection dot;
  - primary button **Open full sidebar**.
- The popup opens the side panel itself (`chrome.sidePanel.open` from the popup's click), then closes.
- Because the user invoked the extension on the current tab, this is also the moment volume boost can arm. **The popup itself tells the background to arm** for the current tab when it is the party's video tab, so this works even when the side panel is already open. *Builder's call, from the reviewer check.*

### 2. Landing (side panel, no party)

Keep the 2.0 structure (name, Start a party from any tab, join with a code, Advanced → server), restyled in the warm tokens:

- the header logo in its rounded square;
- a friendly display line;
- a visible **How it works** link that opens the About & guide sheet (1.2 had a "Guide" button);
- the waking-up note and errors as soft coloured notes (warning / danger tokens).

### 3. Room (side panel, in a party)

Top to bottom:

1. **Header row:**
   - room code chip (cheese colours; click copies the code) with a small connection dot next to it (green connected, grey connecting, red unreachable), which brings back 1.2's "server status";
   - avatar stack;
   - icon buttons: **Minimize to bubble**, **Chat sounds** on/off, **Theme** (cycles System → Light → Night), and **Leave** (asks "Leave the party?").
2. **You row:** your avatar, name and a **Host** (cheese) or **Viewer** (blue) tag, as in 1.2.
3. **Status pill:** the 2.0 status copy ("In sync", "You're the host", "Catching up…", "Waiting for the host's ad", "Reconnecting…", "Pick a tab to watch in", "Open a YouTube or Netflix video to start watching"), coloured by meaning, with its action button when there is one (Use this tab, Sync everyone, Resync).
4. **Now playing:** platform + title, one line.
5. **Collapsible sections**, each a card with a sentence-case title and a chevron. Open/closed state is remembered per section, as in 1.2.
   - **Invite friends:** three coloured buttons, Copy invite / WhatsApp / Email.
   - **Sync:**
     - host: **🔄 Sync everyone** (cheese);
     - viewer: **🔄 Resync me**, plus "Ask the host to:" ⏪ Back / ⏸ Pause / ▶ Play / ⏩ Forward (1.2's viewer actions).
   - **People (N):** one row per person (avatar, name, "You", host tag, status text as in 2.0's people sheet).
   - **Volume boost:** slider 100–300 %, value on the right, the needs-a-click hint when Chrome refuses; double-click resets to 100 % (as in 1.2).

   Defaults: Invite open for the host and closed for viewers; Sync open; People closed; Volume closed.

   **When the panel is short** *(builder's call)*: the controls area (rows 1–6) scrolls on its own and is capped at about 55 % of the panel height. The chat keeps at least ~40 % and the composer is always visible, so opening every section never buries the chat.
6. **Donate a slice:** a permanent soft-tomato **🍕 Donate a slice** button. It sits in the Sync section next to Sync everyone / Resync me (as in the mockup's row), and also in the ⋯ menu so it can be reached with Sync folded, always available and never nagging. It replaces 1.2's big banner and 2.0's 30-minute chat prompt (`donate.ts` prompt logic removed). *Builder's call, from the reviewer check.*
7. **Chat** fills the rest (2.0 behaviour: grouping by person, tinted bubbles, GIFs, emoji, unread pill), then the composer.

The ⋯ menu remains only for About & guide, Donate a slice and the server address.

### 4. Floating bubble

Same behaviour as 2.0, restyled: a surface card with the logo, people count, green/grey dot, tomato unread badge. It always uses the Night palette, because it sits on top of video.

## Not coming back from 1.2 (and why)

| 1.2 control | Decision |
|---|---|
| Sync flexibility slider | Not needed: 2.0 sync corrects itself automatically and has no tuning knob. The slider would do nothing. |
| Red power button | Same as Leave; closing the panel is the X in Chrome's panel header. |
| "Show viewer sync events" toggle | 2.0 only posts sync notices that matter (play/pause/jump/host change). *Builder's call is to drop it; flag if that feels wrong.* |
| Volume boost up to 600 % | Capped at 300 % because above that the limiter can't stop distortion. |

## Constraints

- The extension's permissions stay exactly as they are (check-dist enforces this). The popup needs `action.default_popup` and removing `openPanelOnActionClick`; neither is a permission.
- No text under 12 px; no arbitrary `text-[Npx]`; colours only through tokens; no gradients or coloured glow shadows. Update `uiRules.test.ts` if the token names change, but keep these rules.
- Existing behaviour and tests stay green (`npm test`, `npm run e2e`). The E2E screenshot spec gains popup, light and night room screenshots.

## Left to the builder

Component structure, exact spacing, icon choice (lucide is already a dependency), animation (subtle only), tint math within the contrast rule.
