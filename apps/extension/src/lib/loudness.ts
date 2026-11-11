/**
 * Volume boost above 100 % works like a TV "night mode" turned up: a compressor evens out the film
 * (quiet dialogue comes up, explosions are held back) and make-up gain lifts the whole thing, so the
 * boost really sounds louder instead of just hitting the digital ceiling. At or below 100 % the
 * sound is untouched (only scaled).
 */
export type LoudnessSettings = { threshold: number; ratio: number; knee: number; makeup: number };

/** A typical film level (dBFS RMS) used to size the make-up gain. */
const TYPICAL_DB = -24;

export function loudnessSettings(gain: number): LoudnessSettings {
    if (gain <= 1) return { threshold: 0, ratio: 1, knee: 0, makeup: Math.max(0, gain) };
    const amount = Math.min(1, (gain - 1) / 5); // 0 at 100 %, 1 at 600 %
    const threshold = -10 - 30 * amount;
    const ratio = 1 + 7 * amount;
    const reduction = Math.max(0, TYPICAL_DB - threshold) * (1 - 1 / ratio);
    const makeupDb = 20 * Math.log10(gain) + reduction;
    return { threshold, ratio, knee: 10, makeup: 10 ** (makeupDb / 20) };
}
