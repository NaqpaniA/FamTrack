import assert from 'node:assert/strict';
import test from 'node:test';
import { familyInviteUrl, telegramMiniAppInviteUrl } from './links.js';

test('family invite opens the configured Telegram Mini App with startapp', () => {
    const url = familyInviteUrl('https://famtrack.example.com:9443', 'fi_deadbeef', {
        FAMTRACK_TELEGRAM_BOT_USERNAME: '@NqpFamBot',
        FAMTRACK_TELEGRAM_APP_NAME: 'famtrack'
    });

    assert.equal(url, 'https://t.me/NqpFamBot/famtrack?mode=fullscreen&startapp=fi_deadbeef');
});

test('explicit Mini App URL takes precedence', () => {
    const url = telegramMiniAppInviteUrl('fi_deadbeef', {
        FAMTRACK_MINIAPP_DIRECT_URL: 'https://t.me/another_bot/app/'
    });

    assert.equal(url, 'https://t.me/another_bot/app?mode=fullscreen&startapp=fi_deadbeef');
});

test('explicit Mini App URL keeps its query and forces fullscreen mode', () => {
    const url = telegramMiniAppInviteUrl('fi_deadbeef', {
        FAMTRACK_MINIAPP_DIRECT_URL: 'https://t.me/another_bot/app?theme=family&mode=compact'
    });

    assert.equal(url, 'https://t.me/another_bot/app?theme=family&mode=fullscreen&startapp=fi_deadbeef');
});

test('web invite remains available when no Mini App direct link is configured', () => {
    const url = familyInviteUrl('https://famtrack.example.com:9443/', 'fi_deadbeef', {});

    assert.equal(url, 'https://famtrack.example.com:9443?invite=fi_deadbeef');
});

test('invalid start parameters are never put into a Telegram deep link', () => {
    const url = telegramMiniAppInviteUrl('bad token', {
        FAMTRACK_TELEGRAM_BOT_USERNAME: 'NqpFamBot',
        FAMTRACK_TELEGRAM_APP_NAME: 'famtrack'
    });

    assert.equal(url, undefined);
});
