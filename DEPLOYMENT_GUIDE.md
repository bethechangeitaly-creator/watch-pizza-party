# Watch Pizza Party — Deployment Guide (v2)

Version 2 speaks **protocol v2**, which is not compatible with v1.2. The v2 extension and the v1 extension must talk to **different servers** until everyone has auto-updated. The plan below never breaks an existing user.

## 1. Create a new Giphy key

The v1.2 key is inside the published extension and must be treated as public.

1. Create a new API key at https://developers.giphy.com/dashboard/ (ask for a production key — beta keys are limited to 100 requests/hour).
2. You'll put it on the server in step 2. **Revoke the old key** only after step 5, once v1.2 users have updated (v1.2 still uses it for its GIF picker).

## 2. Deploy the v2 server as a new service

Keep the existing `watch-pizza-party` service running untouched — v1.2 users still need it.

1. Render → **New + → Web Service** → same repository, branch with v2.
2. Name: `watch-pizza-party-v2` (gives `https://watch-pizza-party-v2.onrender.com`).
3. Environment: **Docker**, Dockerfile path `apps/server/Dockerfile`.
4. Environment variables:
   - `GIPHY_API_KEY` = the new key
   - `ALLOWED_ORIGINS` = leave empty (extension origins are always allowed)
   - `TRUST_PROXY` = `1` — Render's proxy sits in front of the server. Without it every user looks like the proxy's IP and shares one rate limit. After deploying, check with a couple of real users that "Too many parties started from this network" never appears; if it does, Render's proxy is not appending the client IP last and per-IP limits must be revisited.
5. Health check path: `/health`.
6. Deploy, then check:

```bash
curl https://watch-pizza-party-v2.onrender.com/health
curl -X POST https://watch-pizza-party-v2.onrender.com/rooms -H 'Content-Type: application/json' -d '{"protocolVersion":2}'
```

The first returns `{"ok":true}`, the second a room with a token.

**Cold starts:** on Render's free tier the server sleeps after 15 minutes without traffic and takes ~30–60 s to wake. The extension retries for up to 75 s and tells users it's waking up, but the first party of the day still waits. A paid instance (Render Starter) or a host without sleep (Fly.io, a small VPS) removes this.

## 3. Package the extension for the v2 server

```bash
VITE_SERVER_URL=https://watch-pizza-party-v2.onrender.com npm run package:extension
```

This builds, runs the dist guard and writes `release/watch-pizza-party-2.0.0.zip`.

No new permissions are requested, so Chrome updates existing installs silently. (The CORS setup means the new server URL does not need a host permission.)

## 4. Publish

1. Chrome Web Store Developer Dashboard → the item → **Package → Upload new package** → the zip.
2. Update the listing text from `STORE_LISTING.md` and the privacy policy URL (`PRIVACY_POLICY.md` changed in 2.0: Giphy, tokens, volume boost).
3. Submit for review.

## 5. Retire v1

Chrome updates installed extensions within about a day of a release going live. Keep the v1 service for **14 days** after 2.0.0 is live, then delete it and revoke the old Giphy key.

## Local development

```bash
npm install
npm run dev:server                 # http://localhost:3005
npm run build:extension            # default server URL baked in
VITE_SERVER_URL=http://localhost:3005 npm run build:extension   # talk to your local server
```

Or set the server inside the extension: Landing → **Advanced** → Server.

### Docker

```bash
GIPHY_API_KEY=... docker compose up --build    # http://localhost:3001
```
