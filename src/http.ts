import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';

function abortError(signal: AbortSignal): AxiosError {
    return new AxiosError('Steam request aborted', signal.reason?.name === 'TimeoutError' ? 'ETIMEDOUT' : 'ERR_CANCELED');
}

async function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(abortError(signal));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([pending, aborted]); }
    finally { signal.removeEventListener('abort', onAbort); }
}

class RequestLimiter {
    private active = 0;
    private queue: Array<{ start: () => void; cancel: () => void }> = [];

    constructor(private limit: number) {}

    async acquire(signal: AbortSignal): Promise<() => void> {
        if (signal.aborted) throw abortError(signal);
        if (this.active < this.limit) {
            this.active++;
            return () => this.release();
        }
        return new Promise((resolve, reject) => {
            const entry = {
                start: () => {
                    signal.removeEventListener('abort', entry.cancel);
                    resolve(() => this.release());
                },
                cancel: () => {
                    this.queue = this.queue.filter(item => item !== entry);
                    reject(abortError(signal));
                },
            };
            this.queue.push(entry);
            signal.addEventListener('abort', entry.cancel, { once: true });
        });
    }

    private release() {
        const next = this.queue.shift();
        if (next) next.start();
        else this.active--;
    }
}

export type HttpOptions = {
    timeoutMs?: number; concurrency?: number; retries?: number; backoffMs?: number;
};

export class SteamHttpClient {
    private limiter: RequestLimiter;
    private timeoutMs: number;
    private retries: number;
    private backoffMs: number;

    constructor(private client: AxiosInstance, options: HttpOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.retries = options.retries ?? 2;
        this.backoffMs = options.backoffMs ?? 250;
        this.limiter = new RequestLimiter(options.concurrency ?? 4);
    }

    async get<T = any>(url: string, options: { params?: Record<string, unknown>; signal?: AbortSignal } = {}): Promise<AxiosResponse<T>> {
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(new DOMException('Request deadline exceeded', 'TimeoutError')), this.timeoutMs);
        const expires = Date.now() + this.timeoutMs;
        const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
        try {
            for (let attempt = 0; ; attempt++) {
                let release: (() => void) | undefined;
                let failure: unknown;
                try {
                    release = await this.limiter.acquire(signal);
                    if (signal.aborted) throw abortError(signal);
                    return await abortable(this.client.get<T>(url, {
                        ...options, signal, timeout: Math.max(1, expires - Date.now()),
                        maxContentLength: 2 * 1024 * 1024,
                        maxBodyLength: 2 * 1024 * 1024,
                    }), signal);
                } catch (error) {
                    if (signal.aborted) throw abortError(signal);
                    failure = error;
                } finally { release?.(); }

                if (attempt >= this.retries || !this.isRetryable(failure)) throw failure;
                const retryAfter = axios.isAxiosError(failure) ? failure.response?.headers['retry-after'] : undefined;
                const requestedDelay = retryAfter === undefined ? NaN :
                    Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(String(retryAfter)) - Date.now();
                const waitMs = Number.isFinite(requestedDelay) ? Math.max(0, requestedDelay) :
                    this.backoffMs * 2 ** attempt + Math.random() * this.backoffMs;
                // Never retry sooner than Retry-After or beyond the request deadline.
                if (Date.now() + waitMs >= expires) throw failure;
                try { await delay(waitMs, undefined, { signal }); }
                catch { throw abortError(signal); }
            }
        } finally { clearTimeout(timer); }
    }

    private isRetryable(error: unknown) {
        if (!axios.isAxiosError(error)) return false;
        if (error.response) return [429, 500, 502, 503, 504].includes(error.response.status);
        return ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code ?? '');
    }
}
