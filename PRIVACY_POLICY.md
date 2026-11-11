# Privacy Policy for Watch Pizza Party

**Last Updated:** November 11, 2026 (version 2.0)

## Overview

Watch Pizza Party is a Chrome extension that lets friends watch YouTube and Netflix in sync, with a chat on the side. This policy explains what data the extension and its server handle, and for how long.

## What we handle

1. **Your display name** — a random pizza-themed name (e.g. "Basil Burrata") or one you type. It is shown to the people in your room and is not linked to your identity.
2. **A room token** — a random code the server gives you when you join, so you can reconnect as the same person. It is stored in your browser and deleted after 8 hours or when you leave the party.
3. **Room data** — the room code, who is in the room, and the playback state of the video being watched (which YouTube or Netflix video, its position, playing or paused). This is what keeps everyone in sync.
4. **Chat messages** — the last 100 messages of each room, so people who join later can catch up.
5. **Your IP address** — seen by our server as part of any internet connection, and used only in memory to limit abuse (e.g. too many rooms created). It is not stored.

## What we do not collect

- Your real name, email address or any account
- Your browsing history or what you watch outside a party
- Your YouTube or Netflix credentials
- Payment information
- Analytics, tracking or advertising identifiers

## How long it is kept

- **Everything on the server lives in memory only.** There is no database.
- When everyone has left a room, the room — including its chat — is deleted 30 minutes later. A server restart deletes everything immediately.
- In your browser: the room token (up to 8 hours), the chat of the current party (until you close the browser), and your preferences (theme, chat sounds, server address).

## Third parties

### Our server host (Render.com)
The Pizza Server runs on Render.com. Connections are encrypted (HTTPS/WSS).

### Giphy
When you search for a GIF, your search text goes to **our server**, which asks Giphy for results — Giphy does not see your IP address for searches. The GIF images themselves are then loaded directly from Giphy's servers, so Giphy can see the IP address of everyone who sees a GIF in the chat, as with any image on the web. If the server has no Giphy key, GIF search is turned off. Giphy's privacy policy: https://support.giphy.com/hc/en-us/articles/360032872931

### YouTube and Netflix
The extension reads and controls the video player on YouTube and Netflix pages (play, pause, seek, position) and only on the tab you chose for the party. It does not read your account or your viewing history.

## Volume boost

If you turn on volume boost, the extension captures the party tab's audio and plays it louder. The audio is processed on your computer only and is never sent anywhere. Capture stops when you turn the boost off, change tabs or leave the party.

## Your choices

- Use the extension without any account
- Leave a room at any time (your token is deleted from your browser)
- Uninstall the extension at any time
- Point the extension at your own server (Advanced → Server)

## Children

Watch Pizza Party is meant for a general audience and does not knowingly collect data from children under 13.

## Changes

Changes to this policy are published in the GitHub repository with a new "Last Updated" date.

## Contact

- GitHub: https://github.com/bethechangeitaly-creator/watch-pizza-party
- Developer: Emanuel Caristi
