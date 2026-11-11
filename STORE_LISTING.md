Chrome Web Store Listing - Watch Pizza Party

Extension Name
Watch Pizza Party

Tagline (132 characters max)
Watch Netflix & YouTube together with friends! Real-time sync, built-in chat, and Pizza Server hosting. Stay close, even when far.

Short Description (132 characters max)
Synchronized watch parties for Netflix & YouTube with real-time chat. Free Pizza Server included!

Detailed Description (16,000 characters max)

🍕 Watch Together, Stay Connected

Watch Pizza Party brings people together for synchronized Netflix, YouTube and Prime Video watch parties. Whether you're watching with friends across the country or someone special on the other side of the world, everyone stays in sync automatically.

✨ Key Features

• Stays in sync automatically - small drift is smoothed out, big jumps are followed instantly
• Real-Time Chat - Chat with your party while you watch
• Free Pizza Server - Our hosted server means no setup required
• Netflix & YouTube Support - Works on both major streaming platforms
• Dark & Light Modes - Switch between cinema mode and bright mode
• Volume Boost - Make quiet videos up to 3× louder, without distortion
• Host Controls - Party host controls playback for everyone
• Privacy-First - Anonymous names, no accounts, chat kept in server memory only

🚀 How It Works

1. Open a Netflix, YouTube or Prime Video video
2. Click the Watch Pizza Party icon — the side panel opens
3. Start a party (or join one with a room code)
4. Share the code with friends
5. Enjoy watching together!

🎯 Perfect For

• Long-distance relationships
• Movie nights with friends
• Watch parties with family
• Remote team bonding
• Study groups watching documentaries
• Language learning together

🔒 Privacy & Security

• No account or login required
• Anonymous pizza-themed usernames
• All data deleted after session ends
• Encrypted connections (HTTPS/WSS)
• Open source on GitHub

🌍 Pizza Server

Our free Pizza Server hosts your watch parties so you don't need technical setup. Friends can join from anywhere in the world. The server is hosted in Frankfurt, Germany with automatic cold-start (wakes up in ~30 seconds when needed).

Advanced users can also point the extension at their own server.

💡 Tips for Best Experience

• Use one browser tab at a time
• Stable internet connection recommended
• All participants need the extension installed
• Share room codes via WhatsApp, email, or text

🛠️ Technical Details

• Manifest V3 (latest Chrome extension standard)
• WebSocket-based real-time synchronization
• Clock-synchronized playback timeline with per-platform correction (Netflix/YouTube)
• Rejoin automatically after a network blip, without losing your place or host role
• In-memory room storage (no database)

🆕 What's new in 2.0

• Smoother sync: viewers adjust playback speed slightly instead of jumping around
• Your spot is saved: reconnect after a network blip and stay in the party (and stay host)
• Chat history: friends who join late see what was said
• A cleaner, calmer side panel with a chat-first layout and light/dark themes
• Safer by design: room codes can't be used to take over the host, and the extension never switches your tabs

❤️ Support Development

Watch Pizza Party is free and open source. If you enjoy using it, consider donating a slice of pizza to help keep the Pizza Server running!

🐛 Report Issues

Found a bug? Have a suggestion? Visit our GitHub repository or contact the developer.

---

Built with love by Emanuel Caristi
For people who enjoy a slice of pizza and a shared moment with friends, staying close even when far away.

Category
Social & Communication

Language
English

Keywords/Tags (separated by commas)
watch party, netflix party, youtube sync, watch together, synchronized viewing, video chat, movie night, streaming party, remote viewing, watch with friends

Support URL
https://github.com/bethechangeitaly-creator/watch-pizza-party

Privacy Policy URL
https://raw.githubusercontent.com/bethechangeitaly-creator/watch-pizza-party/main/PRIVACY_POLICY.md

Single Purpose Description (for Chrome Web Store Review)
This extension enables synchronized watch parties on Netflix, YouTube and Prime Video with real-time chat, so friends in different places can watch the same video at the same moment.

Justification for Permissions

Required Permissions:

1. tabs
   - Purpose: Detect which tab contains Netflix/YouTube for synchronization
   - Justification: Essential for identifying the active video player

2. storage
   - Purpose: Remember the current party (room token), the chat of the current party, and preferences (theme, chat sounds, server address)
   - Justification: Reconnect to the same party after a browser or network interruption

3. scripting
   - Purpose: Inject content scripts to interact with video players
   - Justification: Required to control playback and read video state

4. sidePanel
   - Purpose: Display the watch party interface in Chrome's sidebar
   - Justification: Provides non-intrusive UI while watching

5. Host Permissions (netflix.com, youtube.com, youtu.be)
   - Purpose: Access video player elements for synchronization
   - Justification: Extension only works on these streaming sites

   Optional host permissions (primevideo.com and Amazon stores' /gp/video pages)
   - Purpose: Sync Prime Video the same way (play, pause, seek, position)
   - Justification: Requested only when the user starts, joins or follows a party on Prime Video; never requested otherwise, and the content script runs only on video pages of the granted sites

6. tabCapture
   - Purpose: Volume boost
   - Justification: Only used when the user turns volume boost on, for the party tab only; audio is processed locally and never sent anywhere

7. offscreen
   - Purpose: Audio processing for volume boost
   - Justification: Process audio in background for volume enhancement

No Broad Permissions:
- We do NOT request access to all websites
- We do NOT request access to browsing history
- We do NOT request access to bookmarks or downloads
