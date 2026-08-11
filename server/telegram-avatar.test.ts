import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramAvatarError, TelegramAvatarService } from './telegram-avatar.js';

test('Telegram avatar fallback selects the largest photo and caches safe raster bytes', async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/getUserProfilePhotos?')) {
            return Response.json({
                ok: true,
                result: {
                    total_count: 1,
                    photos: [[
                        { file_id: 'small', width: 80, height: 80, file_size: 100 },
                        { file_id: 'large', width: 320, height: 320, file_size: 500 }
                    ]]
                }
            });
        }
        if (url.includes('/getFile?')) {
            assert.match(url, /file_id=large/);
            return Response.json({ ok: true, result: { file_path: 'photos/avatar.jpg' } });
        }
        assert.match(url, /\/file\/bot123:test-token\/photos\/avatar\.jpg$/);
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '4' }
        });
    };
    const service = new TelegramAvatarService({
        botToken: '123:test-token',
        fetchImpl: fetchImpl as typeof fetch,
        clock: () => 1000
    });

    const first = await service.getAvatar(777);
    const second = await service.getAvatar(777);

    assert.equal(first?.contentType, 'image/jpeg');
    assert.deepEqual([...first!.bytes], [0xff, 0xd8, 0xff, 0xd9]);
    assert.equal(second, first);
    assert.equal(calls.length, 3);
});

test('Telegram avatar fallback negatively caches users without a visible photo', async () => {
    let calls = 0;
    const service = new TelegramAvatarService({
        botToken: '123:test-token',
        fetchImpl: (async () => {
            calls += 1;
            return Response.json({ ok: true, result: { total_count: 0, photos: [] } });
        }) as typeof fetch,
        clock: () => 1000
    });

    assert.equal(await service.getAvatar(777), undefined);
    assert.equal(await service.getAvatar(777), undefined);
    assert.equal(calls, 1);
});

test('Telegram avatar fallback rejects an unsafe file path before downloading it', async () => {
    let calls = 0;
    const service = new TelegramAvatarService({
        botToken: '123:test-token',
        fetchImpl: (async (input: string | URL | Request) => {
            calls += 1;
            const url = String(input);
            if (url.includes('/getUserProfilePhotos?')) {
                return Response.json({ ok: true, result: { photos: [[{ file_id: 'photo', width: 1, height: 1 }]] } });
            }
            return Response.json({ ok: true, result: { file_path: '../secret' } });
        }) as typeof fetch
    });

    await assert.rejects(() => service.getAvatar(777), TelegramAvatarError);
    assert.equal(calls, 2);
});

test('Telegram avatar fallback is disabled without a bot token', async () => {
    let called = false;
    const service = new TelegramAvatarService({
        fetchImpl: (async () => {
            called = true;
            throw new Error('must not be called');
        }) as typeof fetch
    });

    assert.equal(await service.getAvatar(777), undefined);
    assert.equal(called, false);
});

test('Telegram avatar fallback never exposes the bot token in transport errors', async () => {
    const botToken = '123:super-secret-token';
    const service = new TelegramAvatarService({
        botToken,
        fetchImpl: (async (input: string | URL | Request) => {
            throw new Error(`network failed for ${String(input)}`);
        }) as typeof fetch
    });

    await assert.rejects(
        () => service.getAvatar(777),
        error => error instanceof TelegramAvatarError
            && error.message === 'Telegram getUserProfilePhotos request failed'
            && !error.message.includes(botToken)
    );
});
