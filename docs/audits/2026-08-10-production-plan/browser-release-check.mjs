import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const baseUrl = process.env.FAMTRACK_E2E_URL || 'http://127.0.0.1:18082';
const auditDir = path.dirname(fileURLToPath(import.meta.url));
const browser = await playwright.firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const apiCalls = [];

page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(`${request.method()} ${url.pathname}`);
});

const clickBottomNav = async name => {
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
};

try {
    const documentResponse = await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.equal(documentResponse?.status(), 200);
    assert.ok(documentResponse?.headers()['content-security-policy']?.includes("default-src 'self'"));
    assert.equal(documentResponse?.headers()['cache-control'], 'no-store');
    assert.ok(documentResponse?.headers()['x-request-id']);
    await page.getByRole('heading', { name: /Привет, Папа/ }).waitFor();
    assert.ok(apiCalls.includes('GET /api/app-data'));
    assert.equal(await page.locator('.vite-error-overlay').count(), 0);

    await clickBottomNav('Задачи');
    await page.getByRole('button', { name: 'Канбан' }).waitFor();
    for (const name of ['Надо сделать', 'В процессе', 'Готово']) {
        await page.getByRole('list', { name }).waitFor();
    }

    await page.getByRole('button', { name: 'Создать проект' }).click();
    let dialog = page.getByRole('dialog', { name: 'Новый проект' });
    await dialog.getByLabel('Название проекта').fill('E2E проект');
    await dialog.getByRole('button', { name: 'Создать проект' }).click();
    await page.getByRole('button', { name: /E2E проект/ }).waitFor();
    await page.getByRole('button', { name: /E2E проект/ }).click();
    await page.getByRole('button', { name: 'Редактировать проект' }).click();
    dialog = page.getByRole('dialog', { name: 'Редактировать проект' });
    await dialog.getByRole('checkbox', { name: /Проект завершён/ }).check();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();

    await page.getByRole('button', { name: /^Все/ }).click();
    await page.getByRole('button', { name: 'Добавить задачу' }).click();
    dialog = page.getByRole('dialog', { name: 'Новая задача' });
    await dialog.getByLabel('Название задачи').fill('E2E задача ребёнка');
    await dialog.getByRole('button', { name: 'Выбрать Сын' }).first().click();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();

    let taskCard = page.getByRole('button', { name: /Открыть задачу «E2E задача ребёнка»/ });
    await taskCard.waitFor();
    await taskCard.focus();
    await taskCard.press('ArrowRight');
    await page.locator('[data-kanban-column="IN_PROGRESS"]')
        .getByRole('button', { name: /E2E задача ребёнка/ })
        .waitFor();
    taskCard = page.getByRole('button', { name: /Открыть задачу «E2E задача ребёнка»/ });
    await taskCard.focus();
    await taskCard.press('ArrowRight');
    await page.getByText(/Completing a task for a child is disabled/).waitFor();
    await page.locator('[data-kanban-column="IN_PROGRESS"]')
        .getByRole('button', { name: /E2E задача ребёнка/ })
        .waitFor();

    await clickBottomNav('Семья');
    await page.getByRole('button', { name: 'Управление' }).click();
    const parentCompletion = page.getByRole('checkbox', { name: /Родитель выполняет за ребёнка/ });
    await parentCompletion.check();
    await page.getByText('Настройки семьи сохранены').waitFor();

    await page.getByRole('button', { name: 'Добавить' }).click();
    dialog = page.getByRole('dialog', { name: 'Награда' });
    await dialog.getByLabel('Название').fill('E2E подарок');
    await dialog.getByLabel('Стоимость XP').fill('25');
    await dialog.getByRole('button', { name: 'Сохранить награду' }).click();
    await page.getByRole('button', { name: /^E2E подарок 25 XP$/ }).waitFor();

    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Убрать E2E подарок из магазина' }).click();
    await page.getByText(/^Архив: 1$/).click();
    await page.getByRole('button', { name: 'Вернуть' }).click();
    await page.getByRole('button', { name: /^E2E подарок 25 XP$/ }).waitFor();
    await page.waitForTimeout(3200);
    await page.screenshot({ path: path.join(auditDir, '04-family-management.png'), fullPage: true });

    await clickBottomNav('Задачи');
    taskCard = page.getByRole('button', { name: /Открыть задачу «E2E задача ребёнка»/ });
    await taskCard.focus();
    await taskCard.press('ArrowRight');
    const doneColumn = page.locator('[data-kanban-column="DONE"]');
    await doneColumn.getByRole('button', { name: /E2E задача ребёнка/ }).waitFor();
    await doneColumn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3200);
    await page.screenshot({ path: path.join(auditDir, '05-kanban-completed.png'), fullPage: true });

    await clickBottomNav('Семья');
    await page.getByRole('button', { name: 'Магазин' }).click();
    const shopReward = page.getByText('E2E подарок', { exact: true }).locator('..');
    await shopReward.getByRole('button').click();
    await page.getByText('Куплено! Предмет уже в рюкзаке.').waitFor();
    await page.getByRole('button', { name: /Закрыть уведомление: Куплено!/ }).click();
    await page.getByRole('button', { name: 'Рюкзак', exact: true }).click();
    const inventoryReward = page.getByText('E2E подарок', { exact: true }).locator('..');
    page.once('dialog', confirmation => confirmation.accept());
    await inventoryReward.getByRole('button', { name: 'Использовать' }).click();
    await page.getByText('Награда «E2E подарок» активирована').waitFor();
    await page.getByText(/Использовано/).first().waitFor();
    await page.waitForTimeout(3200);
    await page.screenshot({ path: path.join(auditDir, '06-reward-inventory.png'), fullPage: true });

    await clickBottomNav('Задачи');
    const todoColumn = page.locator('[data-kanban-column="TODO"]');
    const inProgressColumn = page.locator('[data-kanban-column="IN_PROGRESS"]');
    await todoColumn.scrollIntoViewIfNeeded();
    const draggableTask = todoColumn.getByRole('button', { name: /Купить плитку/ });
    await draggableTask.waitFor();
    const sourceBox = await draggableTask.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();
    assert.ok(sourceBox && targetBox);
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 20, sourceBox.y + sourceBox.height / 2, { steps: 3 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await inProgressColumn.getByRole('button', { name: /Купить плитку/ }).waitFor();

    const stateResponse = await context.request.get(`${baseUrl}/api/app-data`);
    assert.equal(stateResponse.status(), 200);
    const envelope = await stateResponse.json();
    const state = envelope.data;
    const task = state.tasks.find(item => item.title === 'E2E задача ребёнка');
    const child = state.members.find(item => item.id === 'u3');
    const epic = state.epics.find(item => item.title === 'E2E проект');
    const reward = state.rewards.find(item => item.title === 'E2E подарок');
    const inventory = state.inventory.find(item => item.rewardId === reward?.id);
    const draggedTask = state.tasks.find(item => item.title === 'Купить плитку');
    assert.equal(state.family.settings.allowParentTaskCompletion, true);
    assert.equal(task?.status, 'DONE');
    assert.equal(task?.assigneeId, 'u3');
    assert.equal(task?.completedById, 'u1');
    assert.ok(task?.rewardedAt);
    assert.equal(child?.xp, 900);
    assert.equal(epic?.isCompleted, true);
    assert.equal(reward?.isActive, true);
    assert.equal(inventory?.status, 'USED');
    assert.equal(draggedTask?.status, 'IN_PROGRESS');
    assert.ok(apiCalls.filter(call => call === 'POST /api/tasks/status').length >= 4);
    assert.ok(apiCalls.includes('POST /api/family/settings'));
    assert.ok(apiCalls.includes('POST /api/rewards/archive'));
    assert.ok(apiCalls.includes('POST /api/rewards/purchase'));
    assert.ok(apiCalls.includes('POST /api/rewards/use'));
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log(JSON.stringify({
        ok: true,
        revision: envelope.revision,
        apiCalls: apiCalls.length,
        taskStatusCalls: apiCalls.filter(call => call === 'POST /api/tasks/status').length,
        childXp: child.xp,
        screenshots: [
            '04-family-management.png',
            '05-kanban-completed.png',
            '06-reward-inventory.png'
        ]
    }));
} catch (error) {
    await page.screenshot({ path: path.join(auditDir, '99-browser-release-failure.png'), fullPage: true });
    throw error;
} finally {
    await browser.close();
}
