# Watch Pizza Party 2.0 — Release Guide

Version 2.0 replaces the server **in place**: same address (`https://watch-pizza-party.onrender.com`), new code. The 2.0 extension already points at that address, so there is no second permanent server.

Version 2.0 and 1.2 can't talk to each other. When the server switches, anyone still on 1.2 sees *"Watch Pizza Party was updated. Update the extension (chrome://extensions → Update) and try again."* until Chrome updates them (usually within hours). To keep that window short, the server switch and the store release happen together (Part 3).

Who does what: **you** work in the Render, Giphy and Chrome Web Store dashboards; **Claude** runs the git, build and packaging commands.

---

## Part 1 — Preparation (once)

1. **Push the 2.0 branch to GitHub** *(Claude)*. This uploads branch `v2-overhaul`. It does **not** change the live server: Render only deploys `main`.
2. **New Giphy key** *(you)*. The key inside 1.2 is public. At https://developers.giphy.com/dashboard/ create an app and copy its API key. Ask for a production key if Giphy offers it; beta keys are limited to 100 searches per hour.
3. **Check the live service settings** *(you)*. Render → `watch-pizza-party` → **Settings**. Note:
   - **Runtime**: should be *Docker*, with Dockerfile path `apps/server/Dockerfile`
   - **Branch**: should be `main`
   - **Auto-Deploy**: should be *On Commit*
   - **Health Check Path**

   Send these to Claude. If anything differs, Claude adjusts the steps.

## Part 2 — Test online with a temporary server

This runs the 2.0 server on a separate free address, so testing can't affect 1.2 users.

1. **Create the temporary service** *(you)*. Render → **New + → Web Service** → your `watch-pizza-party` repository.
   - Name: `wpp-test` (the address becomes `https://wpp-test.onrender.com`, or similar — copy the real one)
   - Branch: `v2-overhaul`
   - Runtime: **Docker**, Dockerfile path `apps/server/Dockerfile`
   - Instance type: **Free**
   - Health Check Path: `/health`
   - Environment variables: `TRUST_PROXY` = `1`, `GIPHY_API_KEY` = the new key
   - Create it and wait until it says **Live**. Opening `https://<address>/health` in the browser should show `{"ok":true}`.
2. **Build a test extension for that address** *(Claude)*. You get a folder `apps/extension/dist` and a zip.
3. **Install it** *(you and a friend)*:
   - In `chrome://extensions`, **turn off** the store version of Watch Pizza Party (otherwise both run at once).
   - Turn on **Developer mode** (top right) → **Load unpacked** → choose the folder. Your friend unzips the zip you send them and does the same.
4. **Test** *(you and the friend)*: go through `docs/QA_CHECKLIST.md`, especially Netflix, which couldn't be tested automatically. Tell Claude about anything odd.

When everything works, move on. Keep the temporary service until Part 4.

## Part 3 — Release

1. **Build the store package** *(Claude)*. This builds for the real address and writes `release/watch-pizza-party-2.0.0.zip`.
2. **Submit to the Chrome Web Store** *(you)*. https://chrome.google.com/webstore/devconsole → Watch Pizza Party:
   - **Package** → *Upload new package* → the zip.
   - **Store listing**: paste the texts from `STORE_LISTING.md` (description, "What's new in 2.0").
   - **Privacy**: the privacy policy changed (Giphy, room tokens, volume boost). Make sure the policy URL shows the new `PRIVACY_POLICY.md`. The URL reads from GitHub `main`, which is updated in step 4 — if the review starts before that, paste the new text somewhere public (e.g. a GitHub Gist) and use that URL.
   - Permission justifications: copy from `STORE_LISTING.md`. **No permissions were added**, so users won't be asked anything.
   - **Submit for review** and **untick "Publish automatically after review"** (wording varies — look for the option to publish manually / defer publishing). Review usually takes 1–3 days.
3. **Prepare the live server while you wait** *(you)*. Render → `watch-pizza-party` → **Environment**:
   - add `TRUST_PROXY` = `1`
   - add `GIPHY_API_KEY` = the new key
   - you can delete `CORS_ORIGIN` (no longer used)
   - **Settings → Health Check Path** = `/health`

   Saving environment variables may restart the server, still on the old code — that's fine.
4. **When the store says "Approved" — switch both within minutes**:
   1. *(Claude)* Merge `v2-overhaul` into `main` and push. Render deploys 2.0 to the live address automatically (a few minutes on Docker). If the new version fails to start, Render keeps the old one running.
   2. *(you)* When Render shows the deploy as **Live**, open `https://watch-pizza-party.onrender.com/health` → `{"ok":true}`.
   3. *(you)* In the Web Store dashboard, click **Publish**.
5. **Check** *(you)*: in `chrome://extensions`, remove the unpacked test copy, turn the store version back on and click **Update** (Developer mode on). Start a party and check it works.

## Part 4 — Clean up

*(you)*
- Delete the temporary `wpp-test` service in Render.
- Revoke the old Giphy key a few days later (1.2 users still use it for GIFs until they update).

*(Claude)*
- Delete the merged `v2-overhaul` branch.
- Remove old build copies from the repository (`watch-pizza-party-v1.0.2/`, `watch-pizza-party-v1.2/`, old zips) if you no longer want them there.

---

## Notes

- **Cold starts**: on Render's free tier the server sleeps after 15 minutes idle, and the first party of the day waits 30–60 s. The extension handles this ("Waking up the server…"), but a paid instance (Render Starter) removes the wait.
- **If something goes wrong after the release**: Render → `watch-pizza-party` → **Events** → *Rollback* to the previous deploy brings back the old server. The store keeps 2.0, though, so a rollback only makes sense together with fixing 2.0 quickly.
- **Local development**: `npm run dev:server` runs the server on http://localhost:3005, and `VITE_SERVER_URL=http://localhost:3005 npm run build:extension` builds the extension against it.
