Chrome Web Store Listing - Watch Pizza Party

Extension Name
Watch Pizza Party

Tagline (132 characters max)
Watch Netflix & YouTube together with friends! Real-time sync, built-in chat, and Pizza Server hosting. Stay close, even when far.

Short Description (132 characters max)
Synchronized watch parties for Netflix & YouTube with real-time chat. Free Pizza Server included!

Detailed Description (16,000 characters max)

🍕 Watch Together, Stay Connected

Watch Pizza Party brings people together for synchronized Netflix and YouTube watch parties. Whether you're watching with friends across the country or someone special on the other side of the world, our extension keeps everyone perfectly in sync.

✨ Key Features

• Perfect Synchronization - Advanced sync engine keeps everyone watching at the same moment
• Real-Time Chat - Chat with your party while you watch
• Free Pizza Server - Our hosted server means no setup required
• Netflix & YouTube Support - Works on both major streaming platforms
• Dark & Light Modes - Switch between cinema mode and bright mode
• Volume Boost - Amplify quiet audio up to 600%
• Host Controls - Party host controls playback for everyone
• Privacy-First - Anonymous usernames, no accounts required

🚀 How It Works

1. Open Netflix or YouTube
2. Click the Watch Pizza Party icon
3. Create or join a party with a room code
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

Advanced users can also run a local server for private networks.

💡 Tips for Best Experience

• Use one browser tab at a time
• Stable internet connection recommended
• All participants need the extension installed
• Share room codes via WhatsApp, email, or text

🛠️ Technical Details

• Manifest V3 (latest Chrome extension standard)
• WebSocket-based real-time synchronization
• Platform-specific sync profiles (Netflix/YouTube optimized)
• Adjustable sync flexibility (0-100 scale)
• In-memory room storage (no database)

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
This extension enables synchronized watch parties on Netflix and YouTube with real-time chat, allowing users to watch videos together with perfect synchronization.

Justification for Permissions

Required Permissions:

1. tabs
   - Purpose: Detect which tab contains Netflix/YouTube for synchronization
   - Justification: Essential for identifying the active video player

2. storage
   - Purpose: Save user preferences (server selection, username, sync settings)
   - Justification: Persist settings across browser sessions

3. scripting
   - Purpose: Inject content scripts to interact with video players
   - Justification: Required to control playback and read video state

4. sidePanel
   - Purpose: Display the watch party interface in Chrome's sidebar
   - Justification: Provides non-intrusive UI while watching

5. Host Permissions (netflix.com, youtube.com, youtu.be)
   - Purpose: Access video player elements for synchronization
   - Justification: Extension only works on these streaming sites

6. tabCapture (optional)
   - Purpose: Enable volume boost feature
   - Justification: Amplify audio for users who need it

7. offscreen
   - Purpose: Audio processing for volume boost
   - Justification: Process audio in background for volume enhancement

No Broad Permissions:
- We do NOT request access to all websites
- We do NOT request access to browsing history
- We do NOT request access to bookmarks or downloads
