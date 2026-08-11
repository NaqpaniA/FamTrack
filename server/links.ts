type LinkEnvironment = {
    [key: string]: string | undefined;
    FAMTRACK_MINIAPP_DIRECT_URL?: string;
    FAMTRACK_TELEGRAM_BOT_USERNAME?: string;
    FAMTRACK_TELEGRAM_APP_NAME?: string;
};

const inviteTokenPattern = /^[A-Za-z0-9_-]{1,180}$/;
const botUsernamePattern = /^[A-Za-z0-9_]{5,64}$/;
const appNamePattern = /^[A-Za-z0-9_]{1,64}$/;

export function telegramMiniAppBaseUrl(environment: LinkEnvironment = process.env) {
    const explicit = environment.FAMTRACK_MINIAPP_DIRECT_URL?.trim();
    if (explicit) {
        try {
            const url = new URL(explicit);
            if (url.protocol !== 'https:') return undefined;
            url.pathname = url.pathname.replace(/\/+$/, '');
            return withFullscreenMode(url).toString();
        } catch {
            return undefined;
        }
    }

    const botUsername = environment.FAMTRACK_TELEGRAM_BOT_USERNAME?.trim().replace(/^@+/, '') || '';
    const appName = environment.FAMTRACK_TELEGRAM_APP_NAME?.trim().replace(/^\/+|\/+$/g, '') || '';
    if (!botUsernamePattern.test(botUsername) || !appNamePattern.test(appName)) return undefined;
    return withFullscreenMode(new URL(`https://t.me/${botUsername}/${appName}`)).toString();
}

export function telegramMiniAppInviteUrl(token: string, environment: LinkEnvironment = process.env) {
    if (!inviteTokenPattern.test(token)) return undefined;
    const baseUrl = telegramMiniAppBaseUrl(environment);
    if (!baseUrl) return undefined;
    const url = new URL(baseUrl);
    url.searchParams.set('startapp', token);
    return url.toString();
}

export function familyInviteUrl(webBaseUrl: string, token: string, environment: LinkEnvironment = process.env) {
    return telegramMiniAppInviteUrl(token, environment)
        || `${webBaseUrl.replace(/\/+$/, '')}?invite=${encodeURIComponent(token)}`;
}

const withFullscreenMode = (url: URL) => {
    if (url.hostname.toLowerCase() === 't.me') {
        url.searchParams.set('mode', 'fullscreen');
    }
    return url;
};
