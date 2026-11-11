# Manual QA checklist (v2)

`npm test` and `npm run e2e` cover the protocol, the sync controller and YouTube sync in a real browser. These are the things they can't cover. Use two Chrome profiles (or two computers), load the packaged build, and point both at the same server.

## Netflix (DRM — not testable headless)
- [ ] Host starts a party on a Netflix episode; viewer joins from a blank tab and lands on the same episode
- [ ] Play, pause, seek forward/back: viewer follows within ~2 s, no repeated seeking ("stutter loop")
- [ ] Host moves to the next episode: viewer follows
- [ ] Netflix ad tier (if available): viewer holds while the host is in an ad and catches up after

## YouTube extras
- [ ] Viewer gets a pre-roll ad the host didn't: no fighting during the ad, viewer catches up after
- [ ] Host browses YouTube home/search between videos: viewers are not moved
- [ ] Host changes playback speed to 1.5×: viewer follows

## Resilience
- [ ] `chrome://serviceworker-internals` → Stop the extension's worker on the **host** mid-party: host stays host, viewers keep playing, chat history is still there when the panel reopens
- [ ] Same on a **viewer**
- [ ] Turn Wi-Fi off for 10 s on the host, then on: host keeps the role, "Reconnecting…" then back to normal
- [ ] Turn Wi-Fi off for 60 s on the host: the earliest viewer becomes host
- [ ] Server cold start (wait 20 min idle on the free tier): "Waking up the server…" then the party starts

## Identity and safety
- [ ] Two people join with the same name: they show as "Marco" and "Marco 2"; each sees their own messages as "You"
- [ ] Someone joins with the host's name: they are a viewer and cannot control playback
- [ ] Paste a non-Giphy image URL in chat: it shows as text, not an image

## Tabs
- [ ] Viewer closes the video tab: no other tab is navigated; status shows "Pick a tab to watch in" → **Use this tab** works
- [ ] Opening the side panel on a different tab never moves the party
- [ ] Minimize to bubble: bubble appears on the video, unread count increases, clicking it reopens the panel; right-click → × hides it
- [ ] Bubble stays visible in fullscreen

## Panel
- [ ] Theme: System / Light / Dark; system follows the OS switch live
- [ ] Volume boost 100→300 %: audio louder without clipping; never switches tabs; stops when leaving
- [ ] Invite: copy code, copy invite, WhatsApp, Email
- [ ] Incognito (split mode): a party in incognito doesn't affect the regular window
