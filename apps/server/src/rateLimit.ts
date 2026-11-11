export class TokenBucket {
    private tokens: number;
    private last: number;

    constructor(
        private readonly capacity: number,
        private readonly refillPerSec: number,
        private readonly now: () => number,
    ) {
        this.tokens = capacity;
        this.last = now();
    }

    take(cost = 1): boolean {
        const t = this.now();
        this.tokens = Math.min(this.capacity, this.tokens + (Math.max(0, t - this.last) / 1000) * this.refillPerSec);
        this.last = t;
        if (this.tokens < cost) return false;
        this.tokens -= cost;
        return true;
    }
}

export class KeyedLimiter {
    private readonly buckets = new Map<string, TokenBucket>();

    constructor(
        private readonly capacity: number,
        private readonly refillPerSec: number,
        private readonly now: () => number,
        private readonly maxKeys = 10_000,
    ) {}

    take(key: string): boolean {
        let bucket = this.buckets.get(key);
        if (!bucket) {
            if (this.buckets.size >= this.maxKeys) {
                const oldest = this.buckets.keys().next().value;
                if (oldest !== undefined) this.buckets.delete(oldest);
            }
            bucket = new TokenBucket(this.capacity, this.refillPerSec, this.now);
            this.buckets.set(key, bucket);
        }
        return bucket.take();
    }
}

/** [capacity, refill per second] */
export const SOCKET_LIMITS = {
    chat: [5, 1],
    hostUpdate: [20, 10],
    viewerStatus: [4, 1],
    request: [3, 0.5],
    join: [5, 0.1],
    time: [10, 2],
} as const;

export const IP_LIMITS = {
    createRoom: [10, 10 / 60],
    join: [30, 30 / 60],
    gifs: [30, 30 / 60],
} as const;

const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string | undefined, extra: readonly string[]): boolean {
    if (!origin) return true;
    if (origin.startsWith('chrome-extension://')) return true;
    if (LOCAL_ORIGIN_RE.test(origin)) return true;
    return extra.includes(origin);
}

/** The last X-Forwarded-For entry is the one our hosting proxy appended; earlier ones are client-controlled. */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string): string {
    const raw = headers['x-forwarded-for'];
    const joined = Array.isArray(raw) ? raw.join(',') : raw ?? '';
    const entries = joined.split(',').map((e) => e.trim()).filter(Boolean);
    return entries[entries.length - 1] ?? fallback;
}
