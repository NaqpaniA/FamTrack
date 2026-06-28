import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DEFAULT_FAMILY_ID, FamTrackDatabase, RevisionConflictError, normalizeAiInputHash } from './database.js';
import { AuthError, getAuthConfig, validateRequestAuth, type AuthContext } from './auth.js';
import { ForbiddenError, assertCanWrite, filterForActor, sanitizeBatchUpdates, isOwner } from './rbac.js';
import type { AiHelperType, AppData, RequestContext } from '../types.js';
import type { Role, User } from '../family.model.js';
import type { TaskStatus } from '../tasks.model.js';
import type { Note, NoteChecklistItem, NoteContentType, NoteScope } from '../notes.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const dbPath = process.env.FAMTRACK_DB_PATH || '/data/famtrack.sqlite';
const staticDir = process.env.FAMTRACK_STATIC_DIR || path.resolve(__dirname, '../../dist');
const authConfig = getAuthConfig();
const aiConfig = getAiConfig();
const metrics = createMetricsStore();

const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
};

const categoryLabels: Record<string, string> = {
    food: 'Продукты',
    transport: 'Транспорт',
    home: 'Аренда/Дом',
    entertainment: 'Досуг',
    shopping: 'Шопинг',
    services: 'Услуги',
    salary: 'Зарплата',
    gift: 'Подарок',
    transfer: 'Перевод',
    goal_contrib: 'В копилку',
    other: 'Другое'
};

const db = await FamTrackDatabase.open(dbPath);

const server = http.createServer(async (req, res) => {
    const started = performance.now();
    let pathname = '/unknown';
    res.on('finish', () => {
        metrics.record(req.method || 'UNKNOWN', pathname, res.statusCode, performance.now() - started);
    });
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        pathname = url.pathname;
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url.pathname);
            return;
        }
        await serveStatic(res, url.pathname);
    } catch (error) {
        handleError(res, error);
    }
});

server.listen(port, host, () => {
    console.log(`FamTrack listening on ${host}:${port}`);
});

process.on('SIGTERM', () => {
    db.close();
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    db.close();
    server.close(() => process.exit(0));
});

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
            ...db.health(),
            authMode: authConfig.mode,
            tenantMode: 'multi-family',
            aiModel: aiConfig.defaultModel
        });
        return;
    }

    const auth = validateRequestAuth(
        headerValue(req, 'x-telegram-init-data'),
        authConfig,
        headerValue(req, 'x-famtrack-agent-secret')
    );

    if (req.method === 'GET' && pathname === '/api/internal/metrics') {
        if (!auth.isInternal) throw new AuthError('Internal metrics require internal auth');
        sendJson(res, 200, {
            ok: true,
            runtime: metrics.snapshot(),
            health: {
                ...db.health(),
                authMode: authConfig.mode,
                tenantMode: 'multi-family',
                aiModel: aiConfig.defaultModel
            }
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/family/invites/accept') {
        const body = await readJsonBody(req);
        const token = normalizeString(body.token, '', 180);
        if (!token) throw badRequest('Invite token is required');
        const envelope = db.acceptFamilyInvite(token, auth);
        const actor = envelope.data.currentUser;
        sendJson(res, 200, {
            revision: envelope.revision,
            data: filterForActor(envelope.data, actor)
        });
        return;
    }

    const context = resolveRequestContext(auth, req);

    if (req.method === 'GET' && pathname === '/api/app-data') {
        sendJson(res, 200, exportForActor(context));
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    const body = await readJsonBody(req);
    const revision = typeof body.revision === 'number' ? body.revision : null;
    const currentData = () => db.getAppData(context.familyId, context.actor);

    switch (pathname) {
        case '/api/family/invites':
            return sendJson(res, 200, createInvite(req, context, body));
        case '/api/tasks/reorder':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => reorderTasks(data, body.tasks));
        case '/api/ai/task-breakdown':
            return sendJson(res, 200, handleAiTaskBreakdown(context, body));
        case '/api/ai/expense-analysis':
            return sendJson(res, 200, handleAiExpenseAnalysis(context, filterForActor(currentData(), context.actor), body));
        case '/api/notes/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => saveNote(data, body.note, context.actor));
        case '/api/notes/delete':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                notes: data.notes.filter(note => note.id !== body.id)
            }));
        case '/api/tasks/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'tasks', body.task));
        case '/api/tasks/delete':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                tasks: data.tasks.filter(task => task.id !== body.id)
            }));
        case '/api/epics/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'epics', body.epic));
        case '/api/epics/delete':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                epics: data.epics.filter(epic => epic.id !== body.id),
                tasks: data.tasks.map(task => task.epicId === body.id ? { ...task, epicId: undefined } : task),
                goals: data.goals.map(goal => goal.epicId === body.id ? { ...goal, epicId: undefined } : goal)
            }));
        case '/api/transactions/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'transactions', body.transaction, true));
        case '/api/accounts/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'accounts', body.account));
        case '/api/goals/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'goals', body.goal));
        case '/api/budgets/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                budgets: Array.isArray(body.budgets) ? body.budgets as AppData['budgets'] : data.budgets
            }));
        case '/api/users/update':
        case '/api/users/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => saveFamilyUser(data, body.user, context.actor));
        case '/api/users/archive':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => setFamilyUserActive(data, body.userId || body.id, false, context.actor));
        case '/api/users/restore':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => setFamilyUserActive(data, body.userId || body.id, true, context.actor));
        case '/api/reward-logs/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                rewardLogs: [body.log as AppData['rewardLogs'][number], ...data.rewardLogs]
            }));
        case '/api/inventory/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'inventory', body.item, true));
        case '/api/savings-goals/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'savingsGoals', body.goal));
        case '/api/contributions/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => ({
                ...data,
                contributions: [body.contribution as AppData['contributions'][number], ...data.contributions]
            }));
        case '/api/subscriptions/save':
            assertCanWrite(context.actor, pathname, body, currentData());
            return sendMutation(res, revision, context, data => upsertById(data, 'subscriptions', body.subscription));
        case '/api/batch':
            return sendMutation(res, revision, context, data => applyScopedUpdates(
                data,
                sanitizeBatchUpdates(context.actor, isObject(body.updates) ? body.updates as Partial<AppData> : {}, data)
            ));
        default:
            sendJson(res, 404, { error: 'API route not found' });
    }
}

function sendMutation(
    res: ServerResponse,
    revision: number | null,
    context: RequestContext,
    mutator: (data: AppData) => AppData
) {
    const envelope = db.mutate(context.familyId, revision, mutator, context.actor);
    sendJson(res, 200, {
        revision: envelope.revision,
        data: filterForActor(envelope.data, context.actor)
    });
}

function createInvite(req: IncomingMessage, context: RequestContext, body: Record<string, unknown>) {
    const wantsNewFamily = body.newFamily === true || (typeof body.familyName === 'string' && body.familyName.trim().length > 0);
    if (wantsNewFamily && !context.isDeveloperOwner) {
        throw new ForbiddenError('Only developer owner can create a new-family invite');
    }
    if (!wantsNewFamily && !isOwner(context.actor)) {
        throw new ForbiddenError('Only family owner can create invites');
    }

    const role = normalizeRole(body.role, wantsNewFamily ? 'OWNER' : 'CHILD');
    const invite = db.createFamilyInvite({
        familyId: wantsNewFamily ? undefined : context.familyId,
        familyName: wantsNewFamily ? normalizeString(body.familyName, 'New family', 80) : undefined,
        createdById: context.actor.id,
        role: wantsNewFamily ? 'OWNER' : role,
        ttlMs: normalizePositiveInteger(body.ttlMs, 1000 * 60 * 60 * 24 * 14)
    });

    return {
        invite,
        url: `${publicBaseUrl(req)}?invite=${encodeURIComponent(invite.token)}`
    };
}

function reorderTasks(data: AppData, rawUpdates: unknown): AppData {
    if (!Array.isArray(rawUpdates)) throw badRequest('Task reorder payload is required');
    const validStatuses = new Set<TaskStatus>(['TODO', 'IN_PROGRESS', 'DONE']);
    const updates = new Map<string, { status: TaskStatus; sortOrder: number }>();
    for (const update of rawUpdates) {
        if (!isObject(update) || typeof update.id !== 'string') continue;
        const status = validStatuses.has(update.status as TaskStatus) ? update.status as TaskStatus : undefined;
        const sortOrder = Number(update.sortOrder);
        if (!status || !Number.isFinite(sortOrder)) continue;
        updates.set(update.id, { status, sortOrder: Math.round(sortOrder) });
    }
    if (updates.size === 0) return data;

    return {
        ...data,
        tasks: data.tasks.map(task => {
            const update = updates.get(task.id);
            return update ? { ...task, ...update } : task;
        })
    };
}

function upsertById<K extends keyof AppData>(
    data: AppData,
    key: K,
    value: unknown,
    prepend = false
): AppData {
    if (!isObject(value) || typeof value.id !== 'string') return data;
    const items = data[key] as unknown as Array<Record<string, unknown>>;
    const idx = items.findIndex(item => item.id === value.id);
    const next = [...items];
    if (idx >= 0) next[idx] = value;
    else if (prepend) next.unshift(value);
    else next.push(value);
    return { ...data, [key]: next };
}

function saveNote(data: AppData, rawNote: unknown, actor: User): AppData {
    if (!isObject(rawNote)) throw badRequest('Note payload is required');
    const previous = typeof rawNote.id === 'string'
        ? data.notes.find(note => note.id === rawNote.id)
        : undefined;
    const note = normalizeNote(rawNote, actor, previous);
    const exists = data.notes.some(item => item.id === note.id);
    const notes = exists
        ? data.notes.map(item => item.id === note.id ? note : item)
        : [note, ...data.notes];
    const events = !exists && note.scope === 'FAMILY'
        ? [createServerEvent(actor, 'NOTE_CREATED', {}), ...(data.events || [])]
        : data.events;
    return {
        ...data,
        notes,
        events
    };
}

function applyScopedUpdates(data: AppData, updates: Partial<AppData>): AppData {
    const next = {
        ...data,
        ...updates
    };
    if (updates.members) {
        next.members = mergeMembersPreservingArchive(data.members, updates.members);
    }
    delete next.archivedMembers;
    return next;
}

function mergeMembersPreservingArchive(previous: User[], incoming: User[]) {
    const incomingById = new Map(incoming.map(member => [member.id, member]));
    const merged = previous.map(member => {
        const next = incomingById.get(member.id);
        if (!next) return member;
        return {
            ...next,
            isActive: typeof next.isActive === 'boolean' ? next.isActive : member.isActive !== false
        };
    });
    const previousIds = new Set(previous.map(member => member.id));
    for (const member of incoming) {
        if (!previousIds.has(member.id)) {
            merged.push({ ...member, isActive: member.isActive !== false });
        }
    }
    return merged;
}

function saveFamilyUser(data: AppData, rawUser: unknown, actor: User): AppData {
    const previous = isObject(rawUser) && typeof rawUser.id === 'string'
        ? data.members.find(member => member.id === rawUser.id)
        : undefined;
    const user = normalizeFamilyUser(rawUser, previous);
    if (user.id === actor.id && user.isActive === false) {
        throw badRequest('Owner cannot archive the current actor through save');
    }

    const exists = data.members.some(member => member.id === user.id);
    const members = exists
        ? data.members.map(member => member.id === user.id ? user : member)
        : [...data.members, user];
    validateFamilyMembers(members);

    return {
        ...data,
        members,
        currentUser: data.currentUser.id === user.id ? user : data.currentUser
    };
}

function normalizeNote(rawNote: Record<string, unknown>, actor: User, previous?: Note): Note {
    const now = Date.now();
    const scope = normalizeNoteScope(rawNote.scope, previous?.scope || 'FAMILY');
    const contentType = normalizeNoteContentType(rawNote.contentType, previous?.contentType || 'TEXT');
    const title = normalizeString(rawNote.title, previous?.title || 'Без названия', 120);
    const body = contentType === 'TEXT'
        ? normalizeOptionalString(rawNote.body, 12000)
        : normalizeOptionalString(rawNote.body, 12000);
    return {
        id: normalizeString(rawNote.id, previous?.id || `note-${randomUUID()}`, 120),
        scope,
        contentType,
        title,
        body,
        checklistItems: contentType === 'CHECKLIST'
            ? normalizeChecklistItems(rawNote.checklistItems)
            : [],
        createdById: previous?.createdById || actor.id,
        updatedById: actor.id,
        isPinned: typeof rawNote.isPinned === 'boolean' ? rawNote.isPinned : previous?.isPinned || false,
        isArchived: typeof rawNote.isArchived === 'boolean' ? rawNote.isArchived : previous?.isArchived || false,
        createdAt: previous?.createdAt || normalizeInteger(rawNote.createdAt, now),
        updatedAt: now
    };
}

function normalizeChecklistItems(value: unknown): NoteChecklistItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter(isObject)
        .map(item => ({
            id: normalizeString(item.id, `check-${randomUUID()}`, 120),
            title: normalizeString(item.title, 'Пункт', 240),
            isCompleted: item.isCompleted === true
        }))
        .slice(0, 80);
}

function normalizeNoteScope(value: unknown, fallback: NoteScope): NoteScope {
    return value === 'PERSONAL' || value === 'FAMILY' ? value : fallback;
}

function normalizeNoteContentType(value: unknown, fallback: NoteContentType): NoteContentType {
    return value === 'CHECKLIST' || value === 'TEXT' ? value : fallback;
}

function createServerEvent(actor: User, type: AppData['events'][number]['type'], payload: Record<string, unknown>) {
    return {
        id: randomUUID(),
        type,
        actorId: actor.id,
        payload,
        timestamp: Date.now()
    };
}

function setFamilyUserActive(data: AppData, rawId: unknown, isActive: boolean, actor: User): AppData {
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        throw badRequest('Family member id is required');
    }
    const id = rawId.trim();
    if (!isActive && id === actor.id) {
        throw badRequest('Owner cannot archive the current actor');
    }
    const previous = data.members.find(member => member.id === id);
    if (!previous) {
        throw badRequest('Family member not found');
    }
    const members = data.members.map(member => member.id === id ? { ...member, isActive } : member);
    validateFamilyMembers(members);
    return {
        ...data,
        members
    };
}

function handleAiTaskBreakdown(context: RequestContext, body: Record<string, unknown>) {
    const title = normalizeString(body.title, '', 180);
    const description = normalizeString(body.description, '', aiConfig.maxInputChars);
    const input = JSON.stringify({ title, description });
    if (!title) throw badRequest('Task title is required');
    return withAiCache(context, 'task-breakdown', input, () => {
        const rawParts = description
            .split(/[\n.;]+/g)
            .map(part => part.trim())
            .filter(part => part.length >= 4)
            .slice(0, 8);
        const defaults = [
            `Уточнить результат: ${title}`,
            'Собрать материалы и ограничения',
            'Сделать основной шаг',
            'Проверить качество и закрыть задачу'
        ];
        const parts = rawParts.length >= 2 ? rawParts : defaults;
        return {
            title,
            summary: 'Локальная декомпозиция без reasoning-модели.',
            subtasks: parts.map(part => ({
                id: `ai-${randomUUID()}`,
                title: part.slice(0, 140),
                isCompleted: false
            }))
        };
    });
}

function handleAiExpenseAnalysis(context: RequestContext, data: AppData, body: Record<string, unknown>) {
    const prompt = normalizeString(body.prompt, '', aiConfig.maxInputChars);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const expenses = data.transactions.filter(tx => tx.type === 'EXPENSE');
    const currentMonthExpenses = expenses.filter(tx => tx.date.startsWith(currentMonth));
    const input = JSON.stringify({
        prompt,
        revision: db.getRevision(context.familyId),
        currentMonth,
        txCount: data.transactions.length,
        budgetCount: data.budgets.length
    });

    return withAiCache(context, 'expense-analysis', input, () => {
        const byCategory = new Map<string, number>();
        for (const tx of currentMonthExpenses) {
            byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) || 0) + tx.amount);
        }
        const topCategories = [...byCategory.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5)
            .map(([categoryId, amount]) => ({
                categoryId,
                label: categoryLabels[categoryId] || categoryId,
                amount
            }));
        const budgetWarnings = data.budgets
            .map(budget => {
                const spent = byCategory.get(budget.categoryId) || 0;
                return {
                    categoryId: budget.categoryId,
                    label: categoryLabels[budget.categoryId] || budget.categoryId,
                    spent,
                    limit: budget.limit,
                    percent: budget.limit > 0 ? Math.round((spent / budget.limit) * 100) : 0,
                    isOver: spent > budget.limit
                };
            })
            .filter(item => item.percent >= 75 || item.isOver)
            .sort((left, right) => right.percent - left.percent);
        const total = currentMonthExpenses.reduce((sum, tx) => sum + tx.amount, 0);
        const suggestions = [
            budgetWarnings.some(item => item.isOver)
                ? 'Сначала разберите категории сверх бюджета и отметьте обязательные траты.'
                : 'Бюджеты выглядят управляемо; следите за категориями выше 75%.',
            topCategories[0]
                ? `Главная статья месяца: ${topCategories[0].label}.`
                : 'В этом месяце пока мало расходов для анализа.',
            'Для точности добавляйте комментарии к крупным операциям.'
        ];
        return {
            summary: `За месяц учтено расходов: ${total}. Анализ выполнен локальными эвристиками.`,
            currentMonth,
            totalExpenses: total,
            topCategories,
            budgetWarnings,
            suggestions
        };
    });
}

function withAiCache(context: RequestContext, helperType: AiHelperType, normalizedInput: string, build: () => unknown) {
    if (normalizedInput.length > aiConfig.maxInputChars) {
        throw Object.assign(new Error('AI input is too large'), { status: 413 });
    }
    const inputHash = normalizeAiInputHash(`${context.familyId}:${helperType}:${normalizedInput}`);
    const cached = db.getCachedAiUsage(context.familyId, helperType, inputHash);
    const todayCount = db.countAiUsageSince(context.familyId, startOfUtcDay());
    const remainingBefore = Math.max(0, aiConfig.dailyFamilyLimit - todayCount);
    if (cached) {
        db.logAiUsage({
            familyId: context.familyId,
            actorId: context.actor.id,
            helperType,
            inputHash,
            model: cached.model,
            inputChars: normalizedInput.length,
            outputTokens: cached.outputTokens,
            estimatedCost: 0,
            cached: true,
            responseJson: cached.responseJson
        });
        return {
            result: JSON.parse(cached.responseJson),
            cached: true,
            model: cached.model,
            remainingToday: remainingBefore
        };
    }
    if (todayCount >= aiConfig.dailyFamilyLimit) {
        throw Object.assign(new Error('Daily family AI limit reached'), { status: 429 });
    }

    const result = build();
    const responseJson = JSON.stringify(result);
    const outputTokens = Math.min(aiConfig.maxOutputTokens, Math.ceil(responseJson.length / 4));
    db.logAiUsage({
        familyId: context.familyId,
        actorId: context.actor.id,
        helperType,
        inputHash,
        model: context.isDeveloperOwner && aiConfig.allowReasoningForDeveloper ? aiConfig.reasoningModel : aiConfig.defaultModel,
        inputChars: normalizedInput.length,
        outputTokens,
        estimatedCost: 0,
        cached: false,
        responseJson
    });
    return {
        result,
        cached: false,
        model: context.isDeveloperOwner && aiConfig.allowReasoningForDeveloper ? aiConfig.reasoningModel : aiConfig.defaultModel,
        remainingToday: Math.max(0, aiConfig.dailyFamilyLimit - todayCount - 1)
    };
}

function resolveRequestContext(auth: AuthContext, req: IncomingMessage): RequestContext {
    const headerTelegramId = Number(headerValue(req, 'x-famtrack-actor-telegram-id'));
    const authForActor = auth.isInternal && Number.isFinite(headerTelegramId)
        ? { ...auth, telegramId: headerTelegramId }
        : auth;
    const actor = db.resolveActor(authForActor);
    if (!actor) {
        throw new ForbiddenError('Telegram user is authenticated but not linked to a family profile');
    }
    const telegramId = authForActor.telegramId;
    const isDeveloperOwner = telegramId === 0 || (!!telegramId && !!authConfig.developerOwnerTelegramIds?.has(telegramId));
    return {
        actor,
        familyId: actor.familyId || DEFAULT_FAMILY_ID,
        isDeveloperOwner
    };
}

function exportForActor(context: RequestContext) {
    const envelope = db.exportEnvelope(context.actor);
    return {
        revision: envelope.revision,
        data: filterForActor(envelope.data, context.actor)
    };
}

function getAiConfig() {
    return {
        defaultModel: process.env.AI_DEFAULT_MODEL || 'local-heuristic',
        reasoningModel: process.env.AI_REASONING_MODEL || 'developer-reasoning-disabled',
        dailyFamilyLimit: normalizePositiveInteger(process.env.AI_DAILY_FAMILY_LIMIT, 20),
        maxInputChars: normalizePositiveInteger(process.env.AI_MAX_INPUT_CHARS, 4000),
        maxOutputTokens: normalizePositiveInteger(process.env.AI_MAX_OUTPUT_TOKENS, 700),
        allowReasoningForDeveloper: process.env.AI_ALLOW_DEVELOPER_REASONING === '1'
    };
}

function startOfUtcDay() {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function normalizeFamilyUser(rawUser: unknown, previous?: User): User {
    if (!isObject(rawUser)) {
        throw badRequest('Family member payload is required');
    }
    const role = normalizeRole(rawUser.role, previous?.role || 'CHILD');
    const fallbackName = previous?.name || 'Family member';
    const fallbackAvatar = previous?.avatar || (role === 'CHILD' ? '👦🏻' : '🙂');
    const telegramId = Object.prototype.hasOwnProperty.call(rawUser, 'telegramId')
        ? normalizeTelegramId(rawUser.telegramId)
        : previous?.telegramId;
    const telegramUsername = Object.prototype.hasOwnProperty.call(rawUser, 'telegramUsername')
        ? normalizeTelegramUsername(rawUser.telegramUsername)
        : previous?.telegramUsername;

    return {
        id: normalizeString(rawUser.id, previous?.id || `u-${randomUUID()}`, 80),
        familyId: previous?.familyId,
        name: normalizeString(rawUser.name, fallbackName, 80),
        role,
        avatar: normalizeString(rawUser.avatar, fallbackAvatar, 12),
        xp: normalizeInteger(rawUser.xp, previous?.xp || 0),
        level: Math.max(1, normalizeInteger(rawUser.level, previous?.level || 1)),
        isActive: typeof rawUser.isActive === 'boolean' ? rawUser.isActive : previous?.isActive !== false,
        telegramId,
        telegramUsername,
        telegramFirstName: Object.prototype.hasOwnProperty.call(rawUser, 'telegramFirstName')
            ? normalizeOptionalString(rawUser.telegramFirstName, 80)
            : previous?.telegramFirstName,
        telegramLastName: Object.prototype.hasOwnProperty.call(rawUser, 'telegramLastName')
            ? normalizeOptionalString(rawUser.telegramLastName, 80)
            : previous?.telegramLastName,
        streak: normalizeInteger(rawUser.streak, previous?.streak || 0),
        lastLoginDate: normalizeOptionalString(rawUser.lastLoginDate, 32)
    };
}

function validateFamilyMembers(members: User[]) {
    if (!members.some(member => member.isActive !== false && member.role === 'OWNER')) {
        throw badRequest('At least one active owner is required');
    }
    const ids = new Set<string>();
    const telegramIds = new Map<number, string>();
    for (const member of members) {
        if (ids.has(member.id)) {
            throw badRequest('Family member ids must be unique');
        }
        ids.add(member.id);
        if (!member.telegramId) continue;
        const existing = telegramIds.get(member.telegramId);
        if (existing && existing !== member.id) {
            throw badRequest('Telegram ID must be unique');
        }
        telegramIds.set(member.telegramId, member.id);
    }
}

function normalizeRole(value: unknown, fallback: Role): Role {
    return value === 'OWNER' || value === 'ADMIN' || value === 'CHILD' ? value : fallback;
}

function normalizeTelegramId(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function normalizeTelegramUsername(value: unknown) {
    const username = normalizeOptionalString(value, 64)?.replace(/^@+/, '');
    return username || undefined;
}

function normalizeString(value: unknown, fallback: string, maxLength: number) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return (trimmed || fallback).slice(0, maxLength);
}

function normalizeOptionalString(value: unknown, maxLength: number) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeInteger(value: unknown, fallback: number) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.round(number));
}

function normalizePositiveInteger(value: unknown, fallback: number) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return fallback;
    return Math.round(number);
}

function badRequest(message: string) {
    return Object.assign(new Error(message), { status: 400 });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 5 * 1024 * 1024) {
            throw Object.assign(new Error('Request body is too large'), { status: 413 });
        }
        chunks.push(buffer);
    }
    if (chunks.length === 0) return {};
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return isObject(parsed) ? parsed : {};
    } catch {
        throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
    }
}

async function serveStatic(res: ServerResponse, rawPathname: string) {
    const pathname = decodeURIComponent(rawPathname);
    const requested = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(staticDir, safePath);
    const resolved = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(staticDir, 'index.html');

    if (!resolved.startsWith(staticDir) || !fs.existsSync(resolved)) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }

    res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(resolved)] || 'application/octet-stream',
        'Cache-Control': path.basename(resolved) === 'index.html'
            ? 'no-store'
            : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(resolved).pipe(res);
}

function publicBaseUrl(req: IncomingMessage) {
    const explicit = process.env.FAMTRACK_PUBLIC_URL;
    if (explicit) return explicit.replace(/\/+$/, '');
    const publicHost = process.env.FAMTRACK_PUBLIC_HOST;
    if (publicHost) {
        const port = process.env.FAMTRACK_PUBLIC_PORT ? `:${process.env.FAMTRACK_PUBLIC_PORT}` : '';
        return `https://${publicHost}${port}`;
    }
    const directMiniApp = process.env.FAMTRACK_MINIAPP_DIRECT_URL;
    if (directMiniApp) return directMiniApp.replace(/\/+$/, '');
    const proto = headerValue(req, 'x-forwarded-proto') || 'https';
    return `${proto}://${req.headers.host || 'localhost'}`;
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function handleError(res: ServerResponse, error: unknown) {
    const status = error instanceof AuthError || error instanceof RevisionConflictError || error instanceof ForbiddenError
        ? error.status
        : typeof (error as { status?: unknown })?.status === 'number'
            ? (error as { status: number }).status
            : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    sendJson(res, status, { error: message });
}

function headerValue(req: IncomingMessage, name: string) {
    const value = req.headers[name];
    if (Array.isArray(value)) return value[0];
    return value;
}

type RouteMetric = {
    method: string;
    route: string;
    count: number;
    errors: number;
    durationMsTotal: number;
    buckets: Record<string, number>;
    statusClasses: Record<string, number>;
};

function createMetricsStore() {
    const startedAt = Date.now();
    const latencyBucketsMs = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const routes = new Map<string, RouteMetric>();

    const getRoute = (method: string, pathname: string) => {
        const route = routeGroup(pathname);
        const key = `${method}:${route}`;
        const existing = routes.get(key);
        if (existing) return existing;
        const buckets = Object.fromEntries(latencyBucketsMs.map(bucket => [String(bucket), 0]));
        buckets.inf = 0;
        const next: RouteMetric = {
            method,
            route,
            count: 0,
            errors: 0,
            durationMsTotal: 0,
            buckets,
            statusClasses: {}
        };
        routes.set(key, next);
        return next;
    };

    return {
        record(method: string, pathname: string, statusCode: number, durationMs: number) {
            const item = getRoute(method, pathname);
            item.count += 1;
            item.durationMsTotal += Math.max(0, durationMs);
            if (statusCode >= 500) item.errors += 1;
            const statusClass = `${Math.floor(statusCode / 100)}xx`;
            item.statusClasses[statusClass] = (item.statusClasses[statusClass] || 0) + 1;
            for (const bucket of latencyBucketsMs) {
                if (durationMs <= bucket) item.buckets[String(bucket)] += 1;
            }
            item.buckets.inf += 1;
        },
        snapshot() {
            const memory = process.memoryUsage();
            return {
                startedAt,
                uptimeSeconds: Math.round(process.uptime()),
                pid: process.pid,
                memory: {
                    rssBytes: memory.rss,
                    heapUsedBytes: memory.heapUsed,
                    heapTotalBytes: memory.heapTotal,
                    externalBytes: memory.external
                },
                latencyBucketsMs,
                routes: [...routes.values()]
                    .sort((left, right) => `${left.route}:${left.method}`.localeCompare(`${right.route}:${right.method}`))
                    .map(item => ({
                        ...item,
                        durationMsAvg: item.count > 0 ? item.durationMsTotal / item.count : 0
                    }))
            };
        }
    };
}

function routeGroup(pathname: string) {
    if (pathname === '/api/health') return 'api_health';
    if (pathname === '/api/internal/metrics') return 'api_internal_metrics';
    if (pathname === '/api/app-data') return 'api_app_data';
    if (pathname.startsWith('/api/ai/')) return 'api_ai';
    if (pathname.startsWith('/api/tasks/')) return 'api_tasks';
    if (pathname.startsWith('/api/epics/')) return 'api_epics';
    if (pathname.startsWith('/api/notes/')) return 'api_notes';
    if (pathname.startsWith('/api/family/')) return 'api_family';
    if (pathname.startsWith('/api/users/')) return 'api_users';
    if (pathname.startsWith('/api/transactions/')) return 'api_finance';
    if (pathname.startsWith('/api/accounts/')) return 'api_finance';
    if (pathname.startsWith('/api/goals/')) return 'api_finance';
    if (pathname.startsWith('/api/budgets/')) return 'api_finance';
    if (pathname.startsWith('/api/savings-goals/')) return 'api_finance';
    if (pathname.startsWith('/api/contributions/')) return 'api_finance';
    if (pathname.startsWith('/api/subscriptions/')) return 'api_finance';
    if (pathname.startsWith('/api/reward-logs/')) return 'api_rewards';
    if (pathname.startsWith('/api/inventory/')) return 'api_rewards';
    if (pathname === '/api/batch') return 'api_batch';
    if (pathname.startsWith('/api/')) return 'api_other';
    if (pathname === '/' || pathname.endsWith('.html')) return 'static_html';
    if (pathname.endsWith('.js')) return 'static_js';
    if (pathname.endsWith('.css')) return 'static_css';
    if (pathname.match(/\.(png|jpg|jpeg|webp|ico)$/)) return 'static_asset';
    return 'static_other';
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
