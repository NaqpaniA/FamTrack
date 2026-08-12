import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const baseUrl = process.env.FAMTRACK_E2E_URL || 'http://127.0.0.1:8080';
const auditDir = path.dirname(fileURLToPath(import.meta.url));
const screenshots = path.join(auditDir, 'screenshots');
const longName = 'Александр Очень-Длинное-Семейное-Имя';

const api = await playwright.request.newContext({ baseURL: baseUrl });
let envelope = await (await api.get('/api/app-data')).json();
let mutationSequence = 0;
const command = async (operation, payload) => {
    mutationSequence += 1;
    const response = await api.post(operation, {
        data: {
            revision: envelope.revision,
            mutationId: `visual-hotfix-${Date.now()}-${mutationSequence}`,
            ...payload
        }
    });
    assert.equal(response.status(), 200, `${operation}: ${await response.text()}`);
    envelope = await response.json();
    return envelope.data;
};

await command('/api/users/save', {
    user: { ...envelope.data.currentUser, name: longName }
});
let routine = envelope.data.routines.find(candidate => candidate.title === 'Вынести мусор');
if (!routine) {
    await command('/api/routines/save', {
        routine: { presetId: 'TRASH', assignmentMode: 'FREE', timezone: 'UTC' }
    });
    routine = envelope.data.routines.find(candidate => candidate.title === 'Вынести мусор');
}
assert.ok(routine);
if (routine.accumulatedUnits < 2) {
    await command('/api/routines/record-unit', { routineId: routine.id, units: 2 - routine.accumulatedUnits });
    routine = envelope.data.routines.find(candidate => candidate.id === routine.id);
}
assert.equal(routine.accumulatedUnits, 2);

const browser = await playwright.firefox.launch({ headless: true });
const results = [];

const openAndroid = async (width, safeTop) => {
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
    await context.route('https://telegram.org/**', route => route.abort());
    await context.addInitScript(({ top }) => {
        const listeners = new Map();
        const backHandlers = new Set();
        Object.defineProperty(window, 'Telegram', {
            configurable: true,
            value: {
                WebApp: {
                    platform: 'android',
                    isFullscreen: true,
                    colorScheme: 'light',
                    safeAreaInset: { top, right: 0, bottom: 0, left: 0 },
                    contentSafeAreaInset: { top, right: 0, bottom: 0, left: 0 },
                    viewportStableHeight: window.innerHeight,
                    viewportHeight: window.innerHeight,
                    themeParams: {},
                    ready() {},
                    expand() {},
                    requestFullscreen() {},
                    disableVerticalSwipes() {},
                    setHeaderColor() {},
                    setBackgroundColor() {},
                    onEvent(name, handler) {
                        const values = listeners.get(name) || new Set();
                        values.add(handler);
                        listeners.set(name, values);
                    },
                    offEvent(name, handler) {
                        listeners.get(name)?.delete(handler);
                    },
                    BackButton: {
                        show() {},
                        hide() {},
                        onClick(handler) { backHandlers.add(handler); },
                        offClick(handler) { backHandlers.delete(handler); }
                    }
                }
            }
        });
        window.__triggerTelegramBack = () => {
            for (const handler of backHandlers) handler();
        };
    }, { top: safeTop });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator('.vite-error-overlay').count(), 0);
    assert.ok((await page.locator('body').innerText()).trim().length > 0);
    await page.getByRole('heading', { name: new RegExp(longName) }).waitFor();
    const headingBox = await page.getByRole('heading', { name: new RegExp(longName) }).boundingBox();
    const safeArea = await page.evaluate(() => ({
        value: getComputedStyle(document.documentElement).getPropertyValue('--app-safe-top'),
        fullscreenFloor: getComputedStyle(document.documentElement).getPropertyValue('--tg-fullscreen-fallback-top'),
        screenPaddingTop: getComputedStyle(document.querySelector('.app-screen')).paddingTop
    }));
    assert.ok(headingBox && headingBox.y >= Math.max(52, safeTop), JSON.stringify({ headingBox, safeArea }));
    return { context, page, consoleErrors, pageErrors, headingBox, safeArea };
};

try {
    const small = await openAndroid(360, 24);
    await small.page.screenshot({ path: path.join(screenshots, 'after-360-home.png'), fullPage: true });
    await small.page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Задачи' }).click();
    await small.page.getByRole('group', { name: 'Исполнитель задач' }).waitFor();
    assert.ok(await small.page.getByRole('button', { name: 'Все', exact: true }).isVisible());
    assert.ok(await small.page.getByRole('button', { name: 'Мои', exact: true }).isVisible());
    assert.ok(await small.page.getByText('Вынести мусор', { exact: true }).isVisible(), 'free routine is visible in All');
    await small.page.getByRole('button', { name: 'Мои', exact: true }).click();
    assert.equal(await small.page.getByText('Вынести мусор', { exact: true }).count(), 0, 'unassigned free routine is absent from My');
    await small.page.getByRole('button', { name: 'Канбан' }).click();
    const card = small.page.getByRole('button', { name: /Открыть задачу «Купить плитку»/ });
    await card.waitFor();
    const moveRight = small.page.getByRole('button', { name: /Переместить «Купить плитку» в В процессе/ });
    const moveBox = await moveRight.boundingBox();
    assert.ok(moveBox && moveBox.width >= 44 && moveBox.height >= 44);
    await card.click();
    const status = small.page.getByLabel('Статус задачи');
    await status.waitFor();
    assert.deepEqual(await status.locator('option').allTextContents(), [
        'Входящие', 'Надо сделать', 'В процессе', 'Заблокировано', 'Ожидает', 'Готово', 'Отменено'
    ]);
    await small.page.screenshot({ path: path.join(screenshots, 'after-360-task-status.png'), fullPage: true });
    assert.deepEqual(small.pageErrors, []);
    assert.deepEqual(small.consoleErrors, []);
    results.push({ width: 360, safeTop: 24, headerY: small.headingBox.y, safeArea: small.safeArea, moveTarget: moveBox });
    await small.context.close();

    const large = await openAndroid(430, 68);
    await large.page.screenshot({ path: path.join(screenshots, 'after-430-home-accumulator.png'), fullPage: true });
    await large.page.getByRole('button', { name: 'Добавить пакет' }).click();
    await large.page.getByText('+1 накоплено', { exact: true }).waitFor();
    await large.page.getByRole('button', { name: 'Завершить Вынести мусор' }).click();
    const batchDialog = large.page.getByRole('dialog', { name: 'Завершить накопление' });
    await batchDialog.getByRole('button', { name: 'Завершить 3' }).click();
    await large.page.getByText(`+70 XP → ${longName}`, { exact: true }).waitFor();
    await large.page.screenshot({ path: path.join(screenshots, 'after-430-accumulator-xp.png'), fullPage: true });

    await large.page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Список' }).click();
    await large.page.getByRole('button', { name: 'Запасы' }).click();
    await large.page.getByRole('button', { name: 'Сканировать' }).click();
    const scannerTop = large.page.getByRole('button', { name: 'К запасам' });
    const scannerBottom = large.page.getByRole('button', { name: 'Закрыть сканер' });
    await scannerBottom.waitFor();
    for (const control of [scannerTop, scannerBottom]) {
        const box = await control.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44);
    }
    await large.page.screenshot({ path: path.join(screenshots, 'after-430-scanner.png'), fullPage: true });
    await large.page.evaluate(() => window.__triggerTelegramBack());
    await large.page.getByRole('button', { name: 'Сканировать' }).waitFor();
    assert.deepEqual(large.pageErrors, []);
    assert.deepEqual(large.consoleErrors, []);
    results.push({ width: 430, safeTop: 68, headerY: large.headingBox.y, safeArea: large.safeArea });
    await large.context.close();

    const stateResponse = await api.get('/api/app-data');
    assert.equal(stateResponse.status(), 200);
    const stateEnvelope = await stateResponse.json();
    const state = stateEnvelope.data;
    routine = state.routines.find(candidate => candidate.id === routine.id);
    const member = state.members.find(candidate => candidate.id === state.currentUser.id);
    const completionEvents = state.routineEvents.filter(event => event.routineId === routine.id && event.type === 'COMPLETED');
    const rewardLogs = state.rewardLogs.filter(log => log.description.startsWith('Рутина: Вынести мусор'));
    assert.equal(routine.accumulatedUnits, 0);
    assert.equal(completionEvents.length, 1);
    assert.equal(completionEvents[0].units, 3);
    assert.equal(completionEvents[0].xpAwarded, 70);
    assert.equal(rewardLogs.length, 1);
    assert.equal(state.currentUser.xp, member.xp);

    console.log(JSON.stringify({
        ok: true,
        revision: stateEnvelope.revision,
        results,
        routine: {
            accumulatedUnits: routine.accumulatedUnits,
            completionEvents: completionEvents.length,
            rewardLogs: rewardLogs.length,
            xpAwarded: completionEvents[0].xpAwarded
        },
        screenshots: [
            'after-360-home.png',
            'after-360-task-status.png',
            'after-430-home-accumulator.png',
            'after-430-accumulator-xp.png',
            'after-430-scanner.png'
        ]
    }, null, 2));
} catch (error) {
    console.error(error);
    throw error;
} finally {
    await browser.close();
    await api.dispose();
}
