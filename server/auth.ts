import crypto from 'node:crypto';

export interface AuthContext {
    telegramId?: number;
    username?: string;
    firstName?: string;
    isInternal?: boolean;
}

export interface AuthConfig {
    mode: 'dev' | 'telegram';
    botToken?: string;
    allowedTelegramIds: Set<number>;
    allowedTelegramUsernames: Set<string>;
    developerOwnerTelegramIds?: Set<number>;
    enforceAllowlist?: boolean;
    internalApiSecret?: string;
}

export class AuthError extends Error {
    status = 401;
}

export const getAuthConfig = (): AuthConfig => {
    const mode = (process.env.FAMTRACK_AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'telegram' : 'dev')) as AuthConfig['mode'];
    const allowedTelegramIds = new Set(
        (process.env.FAMTRACK_ALLOWED_TELEGRAM_IDS || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => Number(value))
            .filter(value => Number.isFinite(value))
    );
    const allowedTelegramUsernames = new Set(
        (process.env.FAMTRACK_ALLOWED_TELEGRAM_USERNAMES || '')
            .split(',')
            .map(value => value.trim().replace(/^@/, '').toLowerCase())
            .filter(Boolean)
    );
    const developerOwnerTelegramIds = new Set(
        (process.env.FAMTRACK_OWNER_TELEGRAM_IDS || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => Number(value))
            .filter(value => Number.isFinite(value))
    );

    return {
        mode,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        allowedTelegramIds,
        allowedTelegramUsernames,
        developerOwnerTelegramIds,
        enforceAllowlist: process.env.FAMTRACK_REQUIRE_ALLOWLIST === '1',
        internalApiSecret: process.env.FAMTRACK_INTERNAL_API_SECRET
    };
};

export const validateRequestAuth = (
    initData: string | undefined,
    config: AuthConfig,
    internalSecret?: string
): AuthContext => {
    if (config.internalApiSecret && internalSecret === config.internalApiSecret) {
        return { isInternal: true, username: 'famtrack-agent' };
    }

    if (config.mode === 'dev') {
        return { telegramId: 0, username: 'dev' };
    }

    if (!config.botToken) {
        throw new AuthError('Telegram bot token is not configured');
    }
    if (!initData) {
        throw new AuthError('Telegram initData is required');
    }

    const user = validateTelegramInitData(initData, config.botToken);
    const telegramId = Number(user.id);
    const username = typeof user.username === 'string' ? user.username.toLowerCase() : undefined;
    const allowedById = config.allowedTelegramIds.size > 0 && config.allowedTelegramIds.has(telegramId);
    const allowedByUsername = !!username && config.allowedTelegramUsernames.has(username);

    if (config.enforceAllowlist && !allowedById && !allowedByUsername) {
        console.warn('FamTrack auth rejected Telegram user', JSON.stringify({
            telegramId,
            username,
            firstName: typeof user.first_name === 'string' ? user.first_name : undefined
        }));
        throw new AuthError('Telegram user is not allowed for this family');
    }

    return {
        telegramId,
        username,
        firstName: typeof user.first_name === 'string' ? user.first_name : undefined
    };
};

export const validateTelegramInitData = (initData: string, botToken: string): Record<string, unknown> => {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new AuthError('Telegram initData hash is missing');

    params.delete('hash');
    const dataCheckString = [...params.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(hash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        throw new AuthError('Telegram initData signature is invalid');
    }

    const userJson = params.get('user');
    if (!userJson) throw new AuthError('Telegram user is missing');

    try {
        const user = JSON.parse(userJson);
        if (!user?.id) throw new Error('missing id');
        return user;
    } catch {
        throw new AuthError('Telegram user payload is invalid');
    }
};
