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
let limiter: DynamicsCompressorNode | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let mediaStream: MediaStream | null = null;
let capturedTabId: number | null = null;

function stopCapture() {
    try { sourceNode?.disconnect(); } catch { /* ignore */ }
    try { gainNode?.disconnect(); } catch { /* ignore */ }
    try { limiter?.disconnect(); } catch { /* ignore */ }
    try { analyser?.disconnect(); } catch { /* ignore */ }
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
    limiter = null;
    analyser = null;
    sourceNode = null;
    mediaStream = null;
    capturedTabId = null;
}

/** Output loudness (RMS, dBFS) right now — lets the test check the boost really makes it louder. */
function outputLevelDb(): number | null {
    if (!analyser) return null;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const rms = Math.sqrt(sum / samples.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

async function startCapture(streamId: string, tabId: number | null, gain: number): Promise<{ ok: boolean; error?: string }> {
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

        // Full-quality processing even when the output device prefers a low rate (e.g. a headset in call mode).
        audioCtx = new AudioContext({ sampleRate: 48000 });
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = gain;

        // Only a safety limiter right below full scale: it catches peaks that would crackle,
        // but leaves everything else as loud as the gain makes it (like 1.2's plain gain).
        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;

        sourceNode.connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(audioCtx.destination);
        limiter.connect(analyser);

        // Offscreen documents may start their AudioContext suspended; without this the tab goes silent.
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        capturedTabId = tabId;
        console.log('[WatchParty Offscreen] Audio capture started, gain =', gain);
        return { ok: true };
    } catch (err) {
        console.error('[WatchParty Offscreen] Failed to start audio capture:', err);
        stopCapture();
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    if (message.type === 'OFFSCREEN_START_CAPTURE') {
        void startCapture(message.streamId, typeof message.tabId === 'number' ? message.tabId : null, message.gain).then(sendResponse);
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
        sendResponse({ ok: true, capturing: Boolean(audioCtx && gainNode), tabId: capturedTabId, contextState: audioCtx?.state ?? null, gain: gainNode?.gain.value ?? null, levelDb: outputLevelDb(), sampleRate: audioCtx?.sampleRate ?? null });
        return true;
    }
});
