# 🍕 Watch Pizza Party

> Watch Netflix & YouTube together with friends! Real-time sync, built-in chat, and free Pizza Server hosting.

A Chrome Extension (Manifest V3) + Node.js backend for synchronized watch parties on Netflix and YouTube. Built for people who enjoy a slice of pizza and a shared moment with friends, staying close even when far away.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Love](https://img.shields.io/badge/Made%20with-%E2%9D%A4%EF%B8%8F-red.svg)](https://github.com/bethechangeitaly-creator/watch-pizza-party)

## ✨ Features

- 🎬 **Stays in sync automatically** - Small drift is corrected smoothly, big jumps are followed instantly
- 💬 **Real-Time Chat** - Chat with your party while you watch
- 🍕 **Free Pizza Server** - Hosted server at https://watch-pizza-party.onrender.com (no setup required!)
- 📺 **Netflix & YouTube Support** - Works on both major streaming platforms
- 🌓 **Dark & Light Modes** - Switch between cinema mode and bright mode
- 🔊 **Volume Boost** - Make quiet videos up to 3× louder, with a limiter so it doesn't distort
- 👑 **Host Controls** - Party host controls playback for everyone
- 🔒 **Privacy-First** - Anonymous names, no accounts, chat lives in server memory only

## 🚀 Quick Start

### For Users

1. Install the extension from Chrome Web Store *(coming soon)*
2. Open Netflix or YouTube
3. Click the Watch Pizza Party icon (the side panel opens)
4. Start a party, or join one with a room code
5. Enjoy watching together! 🍕

### For Developers

```bash
# Install dependencies
npm install

# Start the Pizza Server (dev mode)
npm run dev:server

# Build the Chrome extension
npm run build:extension

# Run the tests
npm test        # unit + server integration
npm run e2e     # real-browser YouTube sync test (Playwright)

# Load extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select apps/extension/dist/
```

## 🛠️ Tech Stack

- **Monorepo**: npm workspaces (`@watch-party/*`)
- **Extension**: React 18, Vite, Tailwind CSS, Socket.io-client
- **Backend**: Express, Socket.io, in-memory rooms
- **Shared**: Zod schemas for validation
- **Deployment**: Render.com (Frankfurt, Germany)

## 📖 How It Works

1. **Host** creates a room and gets a room code
2. **Viewers** join using the room code
3. The host's player state is shared as a timeline; every viewer's clock is synced to the server
4. Viewers correct small drift by nudging playback speed and seek only for big jumps
5. Chat while you watch!

## 🎯 Use Cases

- 💑 Long-distance relationships
- 🎉 Movie nights with friends
- 👨‍👩‍👧‍👦 Watch parties with family
- 🏢 Remote team bonding
- 📚 Study groups watching documentaries
- 🌍 Language learning together

## 🔒 Privacy & Security

- ✅ No account or login required
- ✅ Anonymous pizza-themed names (e.g., "Basil Burrata")
- ✅ All data deleted after session ends
- ✅ Encrypted connections (HTTPS/WSS)
- ✅ Open source and transparent
- ✅ No analytics, no tracking, no ads
- ✅ GIF search goes through our server, so your searches aren't tied to you at Giphy

See our [Privacy Policy](PRIVACY_POLICY.md) for details.

## 📦 Project Structure

```
watch-pizza-party/
├── apps/
│   ├── extension/             # Chrome extension (React + Vite)
│   │   └── src/
│   │       ├── background/    # Service worker: session, connection, media tab, volume boost
│   │       ├── content/       # Content script: player adapters, host reporter, viewer follower, bubble
│   │       ├── panel/         # Side panel UI
│   │       └── lib/           # Message contract shared by the three
│   └── server/                # Express + Socket.IO (RoomStore, socket handlers, GIF proxy)
├── packages/shared/           # Protocol schemas, media ids, clock sync, sync controller
├── e2e/                       # Playwright end-to-end tests
└── docker-compose.yml
```

## 🌐 Production Deployment

**Pizza Server**: https://watch-pizza-party.onrender.com

- Auto-deploys from GitHub main branch
- Hosted on Render.com (Frankfurt, Germany)
- Free tier with automatic cold-start (~30 seconds)
- In-memory room storage (rooms are deleted 30 minutes after the last person leaves)

## 🧪 Development

```bash
# Run server in dev mode (with hot reload)
npm run dev:server

# Build extension for production
npm run build:extension

# Run tests
npm test
npm run e2e

# Package the extension for the Chrome Web Store
VITE_SERVER_URL=https://your-server.example npm run package:extension
```

## 🐳 Docker

```bash
# Start server with Docker
docker-compose up -d

# Server runs on http://localhost:3001
```

## 📝 Environment Variables

```bash
# Server configuration
PORT=3005              # Server port (default: 3005)
GIPHY_API_KEY=         # Enables GIF search (the key stays on the server)
ALLOWED_ORIGINS=       # Extra CORS origins; chrome-extension:// and localhost are always allowed
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ❤️ Support

If you enjoy Watch Pizza Party, consider [donating a slice of pizza](https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG) to help keep the Pizza Server running!

## 🐛 Bug Reports & Feature Requests

Found a bug? Have a feature idea? Open an issue on [GitHub Issues](https://github.com/bethechangeitaly-creator/watch-pizza-party/issues).

## 📧 Contact

**Developer**: Emanuel Caristi
**GitHub**: [@bethechangeitaly-creator](https://github.com/bethechangeitaly-creator)

---

**Built with ❤️ by Emanuel Caristi**
*For people who enjoy a slice of pizza and a shared moment with friends, staying close even when far away.*
