// The chat sounds from 1.2: a soft filtered sine "blip", one per kind.
export type Tone = 'send' | 'receive' | 'request' | 'request-back' | 'request-pause' | 'request-play' | 'request-forward';

const TONES: Record<Tone, { from: number; to: number; filter: number; peak: number; rise: number; length: number }> = {
    send: { from: 520, to: 760, filter: 1800, peak: 0.035, rise: 0.015, length: 0.16 },
    receive: { from: 430, to: 560, filter: 1450, peak: 0.028, rise: 0.015, length: 0.16 },
    request: { from: 520, to: 690, filter: 920, peak: 0.03, rise: 0.03, length: 0.22 },
    'request-back': { from: 410, to: 520, filter: 760, peak: 0.03, rise: 0.03, length: 0.22 },
    'request-pause': { from: 470, to: 420, filter: 700, peak: 0.03, rise: 0.03, length: 0.22 },
    'request-play': { from: 620, to: 760, filter: 1040, peak: 0.03, rise: 0.03, length: 0.22 },
    'request-forward': { from: 700, to: 860, filter: 1160, peak: 0.03, rise: 0.03, length: 0.22 },
};

let context: AudioContext | null = null;

/** Chrome keeps audio suspended until the user interacts with the page; call this from any click. */
export function unlockAudio(): void {
    try {
        context ??= new AudioContext();
        if (context.state === 'suspended') void context.resume();
    } catch {
        // Audio is best effort.
    }
}

export function playTone(kind: Tone): void {
    try {
        unlockAudio();
        if (!context) return;
        const t = TONES[kind];
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = t.filter;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(t.from, now);
        oscillator.frequency.exponentialRampToValueAtTime(t.to, now + (kind.startsWith('request') ? 0.11 : 0.08));
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(t.peak, now + t.rise);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t.length);
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + t.length + 0.02);
    } catch {
        // Audio is best effort.
    }
}

/** Which request tone a "… asked the host to …" chat event gets. */
export function requestTone(text: string): Tone {
    const verb = text.match(/asked the host to (go back|go forward|pause|play)$/)?.[1];
    if (verb === 'go back') return 'request-back';
    if (verb === 'go forward') return 'request-forward';
    if (verb === 'pause') return 'request-pause';
    if (verb === 'play') return 'request-play';
    return 'request';
}
