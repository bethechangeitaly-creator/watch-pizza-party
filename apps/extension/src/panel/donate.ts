export const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=BM6CSJULZ2RXG';
export const DONATE_KEY = 'wpp.donate.nextAt';
export const DONATE_AFTER_MS = 30 * 60_000;
export const DONATE_SNOOZE_MS = 7 * 24 * 3_600_000;

/** One gentle prompt in the chat, after 30 minutes in a party, at most once a week. */
export function shouldShowDonatePrompt(args: { joinedAtMs: number; nowMs: number; nextAllowedAtMs: number | null }): boolean {
    if (args.nowMs - args.joinedAtMs < DONATE_AFTER_MS) return false;
    return args.nextAllowedAtMs === null || args.nowMs >= args.nextAllowedAtMs;
}
