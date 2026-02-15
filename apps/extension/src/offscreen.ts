/**
 * Offscreen document for Volume Boost audio processing.
 *
 * Uses chrome.tabCapture stream IDs received from the background service worker
 * to capture tab audio via getUserMedia, then routes it through a GainNode
 * for amplification. This works on DRM/EME content (Netflix) because tabCapture
 * operates after the browser decrypts the audio.
 */

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let mediaStream: MediaStream | null = null;

function stopCapture() {
    try { sourceNode?.disconnect(); } catch { /* ignore */ }
    try { gainNode?.disconnect(); } catch { /* ignore */ }
    try {
        if (audioCtx && audioCtx.state !== 'closed') {
            void audioCtx.close();
        }
    } catch { /* ignore */ }
    if (mediaStream) {
        for (const track of mediaStream.getTracks()) {
            track.stop();
        }
    }
    audioCtx = null;
    gainNode = null;
    sourceNode = null;
    mediaStream = null;
}

async function startCapture(streamId: string, gain: number) {
    // Clean up any existing capture first
    stopCapture();

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            } as unknown as MediaTrackConstraints
        });

        audioCtx = new AudioContext();
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = gain;

        sourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        console.log('[WatchParty Offscreen] Audio capture started, gain =', gain);
    } catch (err) {
        console.error('[WatchParty Offscreen] Failed to start audio capture:', err);
        stopCapture();
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    if (message.type === 'OFFSCREEN_START_CAPTURE') {
        void startCapture(message.streamId, message.gain);
        sendResponse({ ok: true });
        return true;
    }

    if (message.type === 'OFFSCREEN_SET_GAIN') {
        if (gainNode) {
            gainNode.gain.value = message.gain;
            console.log('[WatchParty Offscreen] Updated gain to', message.gain);
        } else {
            console.warn('[WatchParty Offscreen] Cannot update gain - no active capture');
        }
        sendResponse({ ok: true, active: Boolean(gainNode) });
        return true;
    }

    if (message.type === 'OFFSCREEN_STOP_CAPTURE') {
        stopCapture();
        sendResponse({ ok: true });
        return true;
    }

    if (message.type === 'OFFSCREEN_PING') {
        sendResponse({ ok: true, capturing: Boolean(audioCtx && gainNode) });
        return true;
    }
});
