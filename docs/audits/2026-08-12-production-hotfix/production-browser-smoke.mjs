import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const baseUrl = process.env.FAMTRACK_PRODUCTION_FORWARD || 'http://127.0.0.1:18081';
const secret = process.env.FAMTRACK_AGENT_SECRET;
const actorId = process.env.FAMTRACK_ACTOR_ID;
assert.ok(secret && actorId, 'production browser credentials are unavailable');

const auditDir = path.dirname(fileURLToPath(import.meta.url));
const screenshots = path.join(auditDir, 'screenshots');
const authHeaders = {
    'X-FamTrack-Agent-Secret': secret,
    'X-FamTrack-Actor-Telegram-Id': actorId
};
const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: authHeaders });
let envelope = await (await api.get('/api/app-data')).json();
const taskId = `production-hotfix-ui-${Date.now()}`;
const taskTitle = `Hotfix smoke ${Date.now()}`;
let taskCreated = false;

const apiCommand = async (operation, payload) => {
    const current = await (await api.get('/api/app-data')).json();
    const response = await api.post(operation, {
        data: {
            revision: current.revision,
            mutationId: `production-hotfix-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            ...payload
        }
    });
    assert.equal(response.status(), 200, `${operation} failed with ${response.status()}`);
    return response.json();
};

await apiCommand('/api/tasks/save', {
    task: {
        id: taskId,
        title: taskTitle,
        priority: 'MEDIUM',
        difficulty: 'EASY',
        assigneeId: envelope.data.currentUser.id,
        createdById: envelope.data.currentUser.id,
        status: 'TODO',
        subtasks: [],
        createdAt: Date.now(),
        capturedAt: Date.now(),
        sortOrder: 999999
    }
});
taskCreated = true;

const browser = await playwright.firefox.launch({ headless: true });
const requests = [];
const consoleErrors = [];
const pageErrors = [];

const createAndroidPage = async (width, safeTop) => {
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
    await context.route('https://telegram.org/**', route => route.abort());
    await context.route(`${baseUrl}/api/**`, route => route.continue({
        headers: { ...route.request().headers(), ...authHeaders }
    }));
    await context.addInitScript(({ top }) => {
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
                    ready() {}, expand() {}, requestFullscreen() {}, disableVerticalSwipes() {},
                    setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
                    onEvent() {}, offEvent() {},
                    BackButton: {
                        show() {}, hide() {},
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
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) requests.push(`${request.method()} ${url.pathname}`);
    });
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator('.vite-error-overlay').count(), 0);
    assert.ok((await page.locator('body').innerText()).trim().length > 0);
    const header = page.locator('main h1').first();
    await header.waitFor();
    const headerBox = await header.boundingBox();
    const safeArea = await page.evaluate(() => ({
        value: getComputedStyle(document.documentElement).getPropertyValue('--app-safe-top'),
        screenPaddingTop: getComputedStyle(document.querySelector('.app-screen')).paddingTop
    }));
    assert.ok(headerBox && headerBox.y >= Math.max(52, safeTop), JSON.stringify({ headerBox, safeArea }));
    return { context, page, headerBox, safeArea };
};

try {
    const small = await createAndroidPage(360, 24);
    const page = small.page;
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Задачи' }).click();
    await page.getByRole('group', { name: 'Исполнитель задач' }).waitFor();
    await page.getByRole('button', { name: 'Мои', exact: true }).click();
    await page.getByRole('button', { name: 'Канбан' }).click();
    const taskCard = page.getByRole('button', { name: new RegExp(`Открыть задачу «${taskTitle}`) });
    await taskCard.waitFor();
    const rightArrow = page.getByRole('button', { name: new RegExp(`Переместить «${taskTitle}» в В процессе`) });
    const arrowBox = await rightArrow.boundingBox();
    assert.ok(arrowBox && arrowBox.width >= 44 && arrowBox.height >= 44);
    const statusCallsBeforeDoubleTap = requests.filter(item => item === 'POST /api/tasks/status').length;
    await rightArrow.dblclick({ delay: 20 });
    await page.locator('[data-kanban-column="IN_PROGRESS"]')
        .getByRole('button', { name: new RegExp(`^Открыть задачу «${taskTitle}`) })
        .waitFor();
    await page.waitForTimeout(300);
    const statusCallsAfterDoubleTap = requests.filter(item => item === 'POST /api/tasks/status').length;
    assert.equal(statusCallsAfterDoubleTap - statusCallsBeforeDoubleTap, 1, 'double tap sent more than one task status command');

    await page.getByRole('button', { name: new RegExp(`Открыть задачу «${taskTitle}`) }).click();
    const statusSelect = page.getByLabel('Статус задачи');
    await statusSelect.waitFor();
    assert.deepEqual(await statusSelect.locator('option').allTextContents(), [
        'Входящие', 'Надо сделать', 'В процессе', 'Заблокировано', 'Ожидает', 'Готово', 'Отменено'
    ]);
    await statusSelect.selectOption('BLOCKED');
    await page.getByRole('button', { name: 'Высокий', exact: true }).click();
    const commandStart = requests.length;
    await page.getByRole('dialog', { name: 'Редактировать задачу' }).getByRole('button', { name: 'Сохранить' }).click();
    await page.getByRole('dialog', { name: 'Редактировать задачу' }).waitFor({ state: 'detached' });
    const editorCommands = requests.slice(commandStart).filter(item => (
        item === 'POST /api/tasks/save' || item === 'POST /api/tasks/status'
    ));
    assert.deepEqual(editorCommands, ['POST /api/tasks/save', 'POST /api/tasks/status']);
    envelope = await (await api.get('/api/app-data')).json();
    const savedTask = envelope.data.tasks.find(task => task.id === taskId);
    assert.equal(savedTask?.status, 'BLOCKED');
    assert.equal(savedTask?.priority, 'HIGH');
    await page.screenshot({ path: path.join(screenshots, 'production-after-360-tasks.png'), fullPage: true });
    await small.context.close();

    const large = await createAndroidPage(430, 68);
    await large.page.screenshot({ path: path.join(screenshots, 'production-after-430-home.png'), fullPage: true });
    await large.page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Список' }).click();
    await large.page.getByRole('button', { name: 'Запасы' }).click();
    await large.page.getByRole('button', { name: 'Сканировать' }).click();
    const scannerBack = large.page.getByRole('button', { name: 'К запасам' });
    const scannerTitle = large.page.getByText('Штрихкод', { exact: true });
    const scannerClose = large.page.getByRole('button', { name: 'Закрыть сканер' });
    await scannerClose.waitFor();
    const [backBox, titleBox, closeBox] = await Promise.all([
        scannerBack.boundingBox(), scannerTitle.boundingBox(), scannerClose.boundingBox()
    ]);
    assert.ok(backBox && titleBox && closeBox);
    assert.ok(backBox.width >= 44 && backBox.height >= 44 && closeBox.width >= 44 && closeBox.height >= 44);
    assert.ok(backBox.x + backBox.width <= titleBox.x, 'scanner close control overlaps title');
    await large.page.screenshot({ path: path.join(screenshots, 'production-after-430-scanner.png'), fullPage: true });
    await large.page.evaluate(() => window.__triggerTelegramBack());
    await large.page.getByRole('button', { name: 'Сканировать' }).waitFor();
    assert.equal(await large.page.getByRole('button', { name: 'Запасы' }).getAttribute('aria-pressed'), 'true');
    await large.context.close();

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        safeArea360: small.safeArea,
        safeArea430: large.safeArea,
        kanbanArrow: { width: arrowBox.width, height: arrowBox.height },
        doubleTapStatusCommands: statusCallsAfterDoubleTap - statusCallsBeforeDoubleTap,
        editorCommandOrder: editorCommands,
        scannerBackReturnedToPantry: true,
        consoleErrors: consoleErrors.length,
        pageErrors: pageErrors.length,
        screenshots: ['production-after-360-tasks.png', 'production-after-430-home.png', 'production-after-430-scanner.png']
    }, null, 2));
} finally {
    if (taskCreated) {
        try {
            await apiCommand('/api/tasks/delete', { id: taskId });
        } catch (error) {
            console.error(`temporary task cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
            process.exitCode = 1;
        }
    }
    await browser.close();
    await api.dispose();
}
