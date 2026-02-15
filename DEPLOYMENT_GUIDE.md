# Watch Pizza Party - Deployment Guide

## ✅ Completed: Server Configuration Updates

The following changes have been made to prepare for production deployment:

### Server Changes (`apps/server/src/index.ts`)
- ✅ Updated CORS to use `process.env.CORS_ORIGIN` (defaults to `*` for flexibility)
- ✅ Added credentials support to CORS
- ✅ Changed hardcoded join link from `https://watchparty.companion/join/{roomId}` to `Room Code: {roomId}`
- ✅ Server builds successfully

### Version Alignment
- ✅ Root `package.json`: Updated to **1.0.2**
- ✅ Extension `package.json`: Updated to **1.0.2**
- ✅ Manifest.json: Already at **1.0.2**

---

## 🚀 Next Steps: Deploy to Render

### Step 1: Push Code to GitHub

```bash
cd "/Users/emanuelcaristi/Desktop/My Apps/WatchParty Codex"
git add .
git commit -m "Prepare for production deployment - Update CORS, versions, and join link"
git push origin main
```

### Step 2: Create Render Account & Deploy

1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New +" → "Web Service"**
4. Select your **WatchParty Codex** repository
5. Configure:
   - **Name**: `watch-pizza-party` (or your preference)
   - **Environment**: **Docker**
   - **Dockerfile Path**: `apps/server/Dockerfile`
   - **Instance Type**: **Free** (or Starter $7/month for no cold starts)

### Step 3: Set Environment Variables in Render

In the Render dashboard, add these environment variables:

```
NODE_ENV=production
PORT=3001
```

**Optional** (can add later after extension is published):
```
CORS_ORIGIN=chrome-extension://YOUR_EXTENSION_ID
```

### Step 4: Deploy

Click **"Create Web Service"** - Render will:
- Clone your repository
- Build the Docker image using `apps/server/Dockerfile`
- Deploy and provide a URL like: `https://watch-pizza-party.onrender.com`

### Step 5: Note Your Server URL

**IMPORTANT**: Copy the Render URL (e.g., `https://watch-pizza-party.onrender.com`)

You'll need this URL for the extension configuration in the next phase.

---

## 📋 Test Your Deployed Server

Once deployed, test these endpoints:

```bash
# Health check
curl https://YOUR-APP.onrender.com/

# Create a room
curl -X POST https://YOUR-APP.onrender.com/rooms \
  -H "Content-Type: application/json" \
  -d '{"hostUsername":"TestHost"}'

# Response should include:
# {"roomId":"...","hostId":"...","username":"...","joinLink":"Room Code: ..."}
```

---

## ⏭️ After Server Deployment

Once your server is live on Render, proceed to update the extension:

1. Update `apps/extension/src/background.ts` - change `DEFAULT_SERVER_URL` to your Render URL
2. Update `apps/extension/manifest.json` - add your Render domain to `host_permissions`
3. Build extension: `npm run build:extension`
4. Create ZIP from `apps/extension/dist/`
5. Submit to Chrome Web Store

---

## 🔍 Monitoring & Troubleshooting

### Render Dashboard
- View logs in real-time
- Monitor CPU/memory usage
- Check deployment status

### Common Issues

**Issue**: Server shows as "Deploying" for a long time
- **Solution**: Check build logs for errors. Dockerfile might need adjustment.

**Issue**: Server starts but crashes
- **Solution**: Check logs for Node.js errors. Verify environment variables are set.

**Issue**: WebSocket connections fail
- **Solution**: Render supports WebSockets automatically. Ensure you're using `wss://` not `ws://`.

**Issue**: CORS errors in browser
- **Solution**: Update `CORS_ORIGIN` environment variable to include your extension ID or use `*` temporarily.

### Free Tier Limitations
- **Cold Starts**: Server spins down after 15 minutes of inactivity
- **Spin-up Time**: ~30 seconds to start when inactive
- **Upgrade**: $7/month for always-on service

---

## 📝 Next Phase Checklist

After server deployment, you need to:

- [ ] Server deployed to Render and responding to requests
- [ ] Server URL noted (e.g., `https://watch-pizza-party.onrender.com`)
- [ ] Update extension `background.ts` with production server URL
- [ ] Update manifest.json with Render domain in `host_permissions`
- [ ] Build extension
- [ ] Create privacy policy (Phase 1)
- [ ] Capture 5 screenshots (Phase 1)
- [ ] Write detailed store description (Phase 1)
- [ ] Submit to Chrome Web Store (Phase 4)

---

## 🎯 Server Configuration Summary

| Setting | Value |
|---------|-------|
| **Hosting** | Render.com |
| **Plan** | Free tier (can upgrade to $7/month) |
| **Runtime** | Node.js 20 via Docker |
| **Port** | 3001 |
| **SSL** | Automatic (HTTPS) |
| **Domain** | `*.onrender.com` subdomain |
| **Storage** | In-memory (no database) |
| **CORS** | Configurable via env var |

---

## 📞 Support Resources

- **Render Docs**: https://render.com/docs
- **Render Community**: https://community.render.com
- **WebSocket Support**: https://render.com/docs/web-services#websocket-support
- **Docker Deployments**: https://render.com/docs/docker

---

**Date Prepared**: $(date)
**Version**: 1.0.2
**Status**: Ready for deployment
