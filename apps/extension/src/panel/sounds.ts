let context: AudioContext | null = null;

/** A short, quiet two-note chime for incoming messages. */
export function playReceiveTone(): void {
    try {
        context ??= new AudioContext();
        if (context.state === 'suspended') void context.resume();
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(430, now);
        oscillator.frequency.exponentialRampToValueAtTime(560, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.028, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.17);
    } catch {
        // Audio is best effort.
    }
}
