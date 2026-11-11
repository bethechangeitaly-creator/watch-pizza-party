import { createApp } from './app';

const PORT = Number(process.env.PORT || 3005);
const { httpServer } = createApp({ giphyApiKey: process.env.GIPHY_API_KEY });

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Watch Pizza Party server listening on ${PORT}`);
});
