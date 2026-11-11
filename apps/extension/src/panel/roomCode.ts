const CODE_AFTER_LABEL = /code:\s*([A-Za-z0-9_-]{10})/i;
const CODE_IN_QUERY = /[?&]room=([A-Za-z0-9_-]{6,32})/;
const BARE_CODE = /^[A-Za-z0-9_-]{6,32}$/;

/** Accepts a bare code, a pasted invite ("Room code: …") or a link with ?room=. Case is preserved. */
export function parseRoomCode(input: string): string | null {
    const text = input.trim();
    if (!text) return null;
    const labelled = text.match(CODE_AFTER_LABEL) ?? text.match(CODE_IN_QUERY);
    if (labelled) return labelled[1];
    return BARE_CODE.test(text) ? text : null;
}
