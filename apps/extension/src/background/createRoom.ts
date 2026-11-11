import { CreateRoomResponseSchema, PROTOCOL_VERSION, UPDATE_REQUIRED_MESSAGE, type CreateRoomResponse } from '@watch-party/shared';

/** An error the user has to act on — never retried. */
export class CreateRoomError extends Error {
    constructor(message: string, readonly code?: string) {
        super(message);
    }
}

export class UpdateRequiredError extends CreateRoomError {
    constructor() {
        super(UPDATE_REQUIRED_MESSAGE, 'update_required');
    }
}

const RETRY_DELAYS_MS = [2000, 3000, 5000, 8000, 10000];
const GIVE_UP_AFTER_MS = 75_000;
const ATTEMPT_TIMEOUT_MS = 8000;

/** Creates a room, riding out a sleeping (cold-starting) server for up to 75 s. */
export async function createRoomWithRetry(opts: {
    baseUrl: string;
    username: string;
    fetchImpl: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    onWaking: () => void;
}): Promise<CreateRoomResponse> {
    const startedAt = opts.now();
    let attempt = 0;
    let wakingAnnounced = false;

    for (;;) {
        try {
            const res = await opts.fetchImpl(`${opts.baseUrl}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, username: opts.username }),
                signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
            });
            if (res.status === 426) throw new UpdateRequiredError();
            if (res.status === 429) throw new CreateRoomError('Too many parties started from this network. Try again in a minute.', 'rate_limited');
            if (res.ok) {
                const parsed = CreateRoomResponseSchema.safeParse(await res.json().catch(() => null));
                if (!parsed.success) throw new CreateRoomError('The server sent an unexpected response.');
                return parsed.data;
            }
            if (res.status < 500) throw new CreateRoomError(`The server refused the request (${res.status}).`);
            // 5xx: the server (or its proxy) is still starting — retry.
        } catch (error) {
            if (error instanceof CreateRoomError) throw error;
            // Network error or timeout — retry.
        }

        if (!wakingAnnounced) {
            wakingAnnounced = true;
            opts.onWaking();
        }
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        attempt += 1;
        if (opts.now() - startedAt + delay > GIVE_UP_AFTER_MS) {
            throw new CreateRoomError("The server didn't wake up. Try again in a minute.");
        }
        await opts.sleep(delay);
    }
}
