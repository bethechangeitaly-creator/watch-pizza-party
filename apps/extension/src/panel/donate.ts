export const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG';
export const DONATE_KEY = 'wpp.donate.nextAt';
/** As in 1.2: "Not now" hides the card for 40 minutes. */
export const DONATE_SNOOZE_MS = 40 * 60_000;

export function isDonateDue(nextAtMs: number | null, nowMs: number): boolean {
    return nextAtMs === null || nowMs >= nextAtMs;
}
