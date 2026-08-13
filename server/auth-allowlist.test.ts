import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthConfig } from './auth.js';

const withEnv = (overrides: Record<string, string | undefined>, run: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(overrides)) {
        saved[key] = process.env[key];
        if (overrides[key] === undefined) delete process.env[key];
        else process.env[key] = overrides[key];
    }
    try {
        run();
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
};

const captureWarn = (run: () => void): string[] => {
    const original = console.warn;
    const messages: string[] = [];
    console.warn = (...args: unknown[]) => { messages.push(args.map(String).join(' ')); };
    try {
        run();
    } finally {
        console.warn = original;
    }
    return messages;
};

test('production telegram mode without FAMTRACK_REQUIRE_ALLOWLIST warns and does not enforce', () => {
    withEnv({ NODE_ENV: 'production', FAMTRACK_AUTH_MODE: 'telegram', FAMTRACK_REQUIRE_ALLOWLIST: undefined }, () => {
        const warnings = captureWarn(() => {
            const config = getAuthConfig();
            assert.equal(config.enforceAllowlist, false);
        });
        assert.ok(warnings.some(message => message.includes('FAMTRACK_REQUIRE_ALLOWLIST')));
    });
});

test('production telegram mode with FAMTRACK_REQUIRE_ALLOWLIST=1 enforces without warning', () => {
    withEnv({ NODE_ENV: 'production', FAMTRACK_AUTH_MODE: 'telegram', FAMTRACK_REQUIRE_ALLOWLIST: '1' }, () => {
        const warnings = captureWarn(() => {
            const config = getAuthConfig();
            assert.equal(config.enforceAllowlist, true);
        });
        assert.equal(warnings.length, 0);
    });
});

test('dev mode without the flag does not warn', () => {
    withEnv({ NODE_ENV: undefined, FAMTRACK_AUTH_MODE: 'dev', FAMTRACK_REQUIRE_ALLOWLIST: undefined }, () => {
        const warnings = captureWarn(() => {
            const config = getAuthConfig();
            assert.equal(config.enforceAllowlist, false);
        });
        assert.equal(warnings.length, 0);
    });
});
