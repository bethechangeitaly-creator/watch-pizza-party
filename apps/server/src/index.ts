import { createApp } from './app';

const PORT = Number(process.env.PORT || 3005);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const { httpServer } = createApp({ giphyApiKey: process.env.GIPHY_API_KEY, allowedOrigins, trustProxy });

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Watch Pizza Party server listening on ${PORT}`);
});
