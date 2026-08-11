import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';

const DEFAULT_POSITIVE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;
const MAX_PROXY_RESPONSE_BYTES = MAX_AVATAR_BYTES + 1024 * 1024;

const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface TelegramAvatarImage {
    bytes: Uint8Array;
    contentType: string;
}

export class TelegramAvatarError extends Error {
    status = 502;
}

type CacheEntry = {
    expiresAt: number;
    image?: TelegramAvatarImage;
};

type TelegramAvatarServiceOptions = {
    botToken?: string;
    fetchImpl?: typeof fetch;
    proxyUrl?: string;
    clock?: () => number;
    positiveTtlMs?: number;
    negativeTtlMs?: number;
};

export class TelegramAvatarService {
    private readonly botToken?: string;
    private readonly fetchImpl: typeof fetch;
    private readonly clock: () => number;
    private readonly positiveTtlMs: number;
    private readonly negativeTtlMs: number;
    private readonly cache = new Map<number, CacheEntry>();
    private readonly pending = new Map<number, Promise<TelegramAvatarImage | undefined>>();

    constructor(options: TelegramAvatarServiceOptions = {}) {
        this.botToken = options.botToken?.trim() || undefined;
        this.fetchImpl = options.fetchImpl || createTelegramFetch(options.proxyUrl ?? process.env.FAMTRACK_TELEGRAM_PROXY);
        this.clock = options.clock || Date.now;
        this.positiveTtlMs = options.positiveTtlMs || DEFAULT_POSITIVE_TTL_MS;
        this.negativeTtlMs = options.negativeTtlMs || DEFAULT_NEGATIVE_TTL_MS;
    }

    async getAvatar(telegramId: number): Promise<TelegramAvatarImage | undefined> {
        if (!this.botToken || !Number.isSafeInteger(telegramId) || telegramId <= 0) return undefined;
        const now = this.clock();
        const cached = this.cache.get(telegramId);
        if (cached && cached.expiresAt > now) return cached.image;
        this.cache.delete(telegramId);

        const running = this.pending.get(telegramId);
        if (running) return running;

        const request = this.loadAvatar(telegramId)
            .then(image => {
                const cachedAt = this.clock();
                this.cache.delete(telegramId);
                this.cache.set(telegramId, {
                    image,
                    expiresAt: cachedAt + (image ? this.positiveTtlMs : this.negativeTtlMs)
                });
                this.pruneCache(cachedAt);
                return image;
            })
            .finally(() => this.pending.delete(telegramId));
        this.pending.set(telegramId, request);
        return request;
    }

    private async loadAvatar(telegramId: number): Promise<TelegramAvatarImage | undefined> {
        const photos = await this.telegramJson('getUserProfilePhotos', {
            user_id: String(telegramId),
            offset: '0',
            limit: '1'
        });
        const photoGroups = Array.isArray(photos?.photos) ? photos.photos : [];
        const candidates = photoGroups
            .flatMap(group => Array.isArray(group) ? group : [])
            .filter(photo => isRecord(photo) && typeof photo.file_id === 'string');
        const selected = candidates.sort((left, right) => photoWeight(right) - photoWeight(left))[0];
        if (!selected) return undefined;

        const file = await this.telegramJson('getFile', { file_id: String(selected.file_id) });
        const filePath = typeof file?.file_path === 'string' ? file.file_path : '';
        if (!isSafeTelegramFilePath(filePath)) {
            throw new TelegramAvatarError('Telegram returned an invalid avatar file path');
        }

        const response = await this.telegramFetch(
            `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
            { headers: { Accept: 'image/jpeg,image/png,image/webp' } },
            'avatar download'
        );
        if (!response.ok) {
            throw new TelegramAvatarError(`Telegram avatar download failed with status ${response.status}`);
        }
        const declaredSize = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredSize) && declaredSize > MAX_AVATAR_BYTES) {
            throw new TelegramAvatarError('Telegram avatar is too large');
        }
        let bytes: Uint8Array;
        try {
            bytes = new Uint8Array(await response.arrayBuffer());
        } catch {
            throw new TelegramAvatarError('Telegram avatar download returned an unreadable body');
        }
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
            throw new TelegramAvatarError('Telegram avatar has an invalid size');
        }
        const contentType = safeContentType(response.headers.get('content-type'), filePath);
        if (!contentType) {
            throw new TelegramAvatarError('Telegram avatar has an unsupported content type');
        }
        return { bytes, contentType };
    }

    private async telegramJson(method: string, query: Record<string, string>): Promise<Record<string, unknown>> {
        const params = new URLSearchParams(query);
        const response = await this.telegramFetch(
            `https://api.telegram.org/bot${this.botToken}/${method}?${params.toString()}`,
            { headers: { Accept: 'application/json' } },
            method
        );
        if (!response.ok) {
            throw new TelegramAvatarError(`Telegram ${method} failed with status ${response.status}`);
        }
        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new TelegramAvatarError(`Telegram ${method} returned invalid JSON`);
        }
        if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.result)) {
            throw new TelegramAvatarError(`Telegram ${method} returned an invalid response`);
        }
        return payload.result;
    }

    private async telegramFetch(url: string, init: RequestInit, operation: string) {
        try {
            return await this.fetchImpl(url, init);
        } catch {
            throw new TelegramAvatarError(`Telegram ${operation} request failed`);
        }
    }

    private pruneCache(now: number) {
        for (const [telegramId, entry] of this.cache) {
            if (entry.expiresAt <= now) this.cache.delete(telegramId);
        }
        while (this.cache.size > MAX_CACHE_ENTRIES) {
            const oldest = this.cache.keys().next().value as number | undefined;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
    }
}

const photoWeight = (photo: Record<string, unknown>) => {
    const fileSize = Number(photo.file_size);
    if (Number.isFinite(fileSize) && fileSize > 0) return fileSize;
    return Math.max(0, Number(photo.width) || 0) * Math.max(0, Number(photo.height) || 0);
};

const isSafeTelegramFilePath = (value: string) => (
    value.length > 0
    && value.length <= 512
    && !value.includes('..')
    && /^[A-Za-z0-9_./-]+$/.test(value)
);

const safeContentType = (rawValue: string | null, filePath: string) => {
    const normalized = rawValue?.split(';', 1)[0].trim().toLowerCase();
    if (normalized && SAFE_IMAGE_TYPES.has(normalized)) return normalized;
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerPath.endsWith('.png')) return 'image/png';
    if (lowerPath.endsWith('.webp')) return 'image/webp';
    return undefined;
};

const isRecord = (value: unknown): value is Record<string, any> => (
    typeof value === 'object' && value !== null
);

const createTelegramFetch = (rawProxyUrl?: string): typeof fetch => {
    const proxyValue = rawProxyUrl?.trim();
    if (!proxyValue) return fetch;

    let proxyUrl: URL;
    try {
        proxyUrl = new URL(proxyValue);
    } catch {
        throw new TelegramAvatarError('Telegram proxy URL is invalid');
    }
    if (!['socks5:', 'socks5h:'].includes(proxyUrl.protocol)) {
        throw new TelegramAvatarError('Telegram proxy must use socks5 or socks5h');
    }

    const agent = new SocksProxyAgent(proxyUrl, {
        keepAlive: true,
        timeout: TELEGRAM_REQUEST_TIMEOUT_MS
    });
    return ((input: string | URL | Request, init?: RequestInit) => (
        httpsFetch(input, init, agent)
    )) as typeof fetch;
};

const httpsFetch = (
    input: string | URL | Request,
    init: RequestInit | undefined,
    agent: SocksProxyAgent
): Promise<Response> => {
    const requestUrl = new URL(input instanceof Request ? input.url : input);
    if (requestUrl.protocol !== 'https:') {
        return Promise.reject(new Error('Telegram proxy only supports HTTPS'));
    }
    const requestHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => requestHeaders.set(name, value));

    const normalizedRequestHeaders: Record<string, string> = {};
    requestHeaders.forEach((value, name) => {
        normalizedRequestHeaders[name] = value;
    });

    return new Promise((resolve, reject) => {
        let settled = false;
        const finishWithError = (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        const request = https.request(requestUrl, {
            method: init?.method || (input instanceof Request ? input.method : 'GET'),
            headers: normalizedRequestHeaders,
            agent,
            signal: init?.signal || undefined
        }, response => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            response.on('data', (chunk: Buffer | string) => {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                totalBytes += buffer.byteLength;
                if (totalBytes > MAX_PROXY_RESPONSE_BYTES) {
                    request.destroy(new Error('Telegram proxy response is too large'));
                    return;
                }
                chunks.push(buffer);
            });
            response.on('error', finishWithError);
            response.on('end', () => {
                if (settled) return;
                settled = true;
                resolve(new Response(Buffer.concat(chunks), {
                    status: response.statusCode || 502,
                    statusText: response.statusMessage,
                    headers: responseHeaders(response.headers)
                }));
            });
        });
        request.setTimeout(TELEGRAM_REQUEST_TIMEOUT_MS, () => {
            request.destroy(new Error('Telegram proxy request timed out'));
        });
        request.on('error', finishWithError);
        request.end();
    });
};

const responseHeaders = (headers: IncomingHttpHeaders) => {
    const normalized = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
            for (const item of value) normalized.append(name, item);
        } else if (value !== undefined) {
            normalized.set(name, value);
        }
    }
    return normalized;
};
