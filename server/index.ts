import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DEFAULT_FAMILY_ID, FamTrackDatabase, RevisionConflictError, normalizeAiInputHash } from './database.js';
import { AuthError, getAuthConfig, validateRequestAuth, type AuthContext } from './auth.js';
import { ForbiddenError, assertCanWrite, filterForActor, isAdmin, isOwner } from './rbac.js';
import { familyInviteUrl, telegramMiniAppInviteUrl } from './links.js';
import { TelegramAvatarService } from './telegram-avatar.js';
import { familyRevisionEtag, requestEtagMatches } from './http-cache.js';
import { applyCapabilities, readFeatureCapabilities, type FeatureCapabilities } from './features.js';
import { completeRoutine, pauseRoutine, recordRoutineUnit, saveRoutine, skipRoutine } from './routines.js';
import { deleteWishlistItem, saveWishlist, saveWishlistItem, setWishlistReservation } from './wishlists.js';
import { updateDashboardPreferences } from './preferences.js';
import { adjustPantry } from './pantry.js';
import {
    addPurchaseBarcode,
    applyPurchaseImportOcr,
    attachPurchaseImportFile,
    cancelPurchaseImport,
    claimPurchaseImport,
    confirmPurchaseImport,
    createPurchaseImport,
    expirePurchaseImportFiles,
    failPurchaseImport,
    purchaseImportFileForActor,
    purchaseImportOcrBlocksForActor,
    purchaseImportsForActor,
    queuePurchaseImport,
    recoverInterruptedPurchaseImport,
    savePurchaseImportItem,
    updatePurchaseImport
} from './purchase-imports.js';
import {
    assertStoredReceiptPath,
    inspectReceiptImage,
    MAX_RECEIPT_BYTES,
    removeReceiptFile,
    storeReceiptPage
} from './receipt-files.js';
import { ReceiptOcrClient, ReceiptOcrError } from './receipt-ocr-client.js';
import { SerialJobQueue } from './serial-job-queue.js';
import type { AiHelperType, AppData, RequestContext } from '../types.js';
import type { Role, User } from '../family.model.js';
import type { TaskStatus } from '../tasks.model.js';
import type { Note, NoteChecklistItem, NoteContentType, NoteScope } from '../notes.model.js';
import {
    addShoppingItem,
    archiveReward,
    checkInFamilyMember,
    checkoutShoppingItems,
    changeTaskStatus,
    contributeToSavingsGoal,
    normalizeEpicForSave,
    normalizeRewardForSave,
    normalizeTaskForSave,
    paySubscription,
    purchaseReward,
    reminderCandidates,
    saveFinancialTransaction,
    setShoppingItemCompleted,
    updateFamilySettings,
    useReward
} from './domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const dbPath = process.env.FAMTRACK_DB_PATH || '/data/famtrack.sqlite';
const staticDir = process.env.FAMTRACK_STATIC_DIR || path.resolve(__dirname, '../../dist');
const importsDir = process.env.FAMTRACK_IMPORTS_DIR || '/data/imports';
const authConfig = getAuthConfig();
const aiConfig = getAiConfig();
const metrics = createMetricsStore();
const telegramAvatarService = new TelegramAvatarService({ botToken: authConfig.botToken });
const capabilities = readFeatureCapabilities();

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
const receiptOcrClient = new ReceiptOcrClient();
const receiptQueue = new SerialJobQueue(processReceiptQueueKey);

const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = randomUUID();
    let pathname = '/unknown';
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
        'Permissions-Policy',
        `camera=${capabilities.pantry ? '(self)' : '()'}, microphone=(), geolocation=${capabilities.routines ? '(self)' : '()'}`
    );
    res.on('finish', () => {
        metrics.record(req.method || 'UNKNOWN', pathname, res.statusCode, performance.now() - started);
    });
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        pathname = url.pathname;
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Cache-Control', 'no-store');
            await handleApi(req, res, url.pathname);
            return;
        }
        const legacyInviteToken = url.searchParams.get('invite')?.trim();
        const miniAppInviteUrl = legacyInviteToken
            ? telegramMiniAppInviteUrl(legacyInviteToken)
            : undefined;
        if (req.method === 'GET' && miniAppInviteUrl) {
            res.writeHead(302, {
                Location: miniAppInviteUrl,
                'Cache-Control': 'no-store'
            });
            res.end();
            return;
        }
        await serveStatic(res, url.pathname);
    } catch (error) {
        handleError(res, error, {
            requestId,
            method: req.method || 'UNKNOWN',
            pathname
        });
    }
});

server.listen(port, host, () => {
    console.log(`FamTrack listening on ${host}:${port}`);
    if (capabilities.receiptOcr) {
        void recoverReceiptQueue().then(cleanupExpiredReceiptFiles);
        const retentionTimer = setInterval(() => void cleanupExpiredReceiptFiles(), 60 * 60 * 1000);
        retentionTimer.unref();
    }
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
            aiModel: aiConfig.defaultModel,
            capabilities
        });
        return;
    }

    const auth = validateRequestAuth(
        headerValue(req, 'x-telegram-init-data'),
        authConfig,
        headerValue(req, 'x-famtrack-agent-secret')
    );
    const outboxRetry = Number(headerValue(req, 'x-famtrack-outbox-retry'));
    if (Number.isSafeInteger(outboxRetry) && outboxRetry > 0) {
        metrics.recordOutboxRetry(outboxRetry);
    }

    if (req.method === 'GET' && pathname === '/api/internal/metrics') {
        if (!auth.isInternal) throw new AuthError('Internal metrics require internal auth');
        sendJson(res, 200, {
            ok: true,
            runtime: metrics.snapshot(),
            database: db.operationalMetrics(),
            health: {
                ...db.health(),
                authMode: authConfig.mode,
                tenantMode: 'multi-family',
                aiModel: aiConfig.defaultModel
            }
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/internal/reminders/due') {
        if (!auth.isInternal) throw new AuthError('Internal reminders require internal auth');
        const now = Date.now();
        const candidates = db.listFamilyIds().flatMap(familyId => reminderCandidates(db.getAppData(familyId), now));
        sendJson(res, 200, { now, candidates });
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
            data: applyCapabilities(filterForActor(envelope.data, actor), capabilities)
        });
        return;
    }

    const context = resolveRequestContext(auth, req);

    if (req.method === 'GET' && pathname.match(/^\/api\/users\/[^/]+\/avatar$/)) {
        return sendTelegramAvatar(res, pathname, context);
    }

    if (req.method === 'GET' && pathname === '/api/app-data') {
        const envelope = exportForActor(context);
        const etag = familyRevisionEtag(context.familyId, envelope.revision);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Vary', 'X-Telegram-Init-Data, X-FamTrack-Actor-Telegram-Id');
        if (requestEtagMatches(headerValue(req, 'if-none-match'), etag)) {
            res.statusCode = 304;
            res.end();
            return;
        }
        sendJson(res, 200, envelope);
        return;
    }

    const purchaseOcrBlocksMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/ocr-blocks$/);
    if (req.method === 'GET' && purchaseOcrBlocksMatch) {
        requireFeature(capabilities, 'receiptOcr');
        const importId = decodeRouteSegment(purchaseOcrBlocksMatch[1]);
        const blocks = purchaseImportOcrBlocksForActor(db.getAppData(context.familyId, context.actor), importId, context.actor);
        return sendJson(res, 200, { blocks });
    }

    const purchaseFileMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/files\/([1-3])$/);
    if (req.method === 'GET' && purchaseFileMatch) {
        requireFeature(capabilities, 'receiptOcr');
        const importId = decodeRouteSegment(purchaseFileMatch[1]);
        const page = Number(purchaseFileMatch[2]);
        const file = purchaseImportFileForActor(db.getAppData(context.familyId, context.actor), importId, page, context.actor);
        const filePath = assertStoredReceiptPath(importsDir, file.path!);
        const stat = await fs.promises.stat(filePath).catch(() => undefined);
        if (!stat?.isFile()) return sendJson(res, 404, { error: 'Receipt page not found' });
        res.writeHead(200, {
            'Content-Type': file.mimeType,
            'Content-Length': String(stat.size),
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `inline; filename="receipt-page-${page}.${file.mimeType === 'image/png' ? 'png' : 'jpg'}"`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    if (req.method === 'GET' && (pathname === '/api/purchase-imports' || /^\/api\/purchase-imports\/[^/]+$/.test(pathname))) {
        if (!capabilities.pantry && !capabilities.receiptOcr) {
            throw Object.assign(new Error('Feature is not enabled: purchase imports'), { status: 404, code: 'FEATURE_DISABLED' });
        }
        const jobs = purchaseImportsForActor(db.getAppData(context.familyId, context.actor), context.actor);
        const id = pathname === '/api/purchase-imports' ? undefined : decodeRouteSegment(pathname.slice('/api/purchase-imports/'.length));
        if (id) {
            const job = jobs.find(candidate => candidate.id === id);
            if (!job) return sendJson(res, 404, { error: 'Purchase import not found' });
            return sendJson(res, 200, { job });
        }
        return sendJson(res, 200, { jobs });
    }

    if (req.method === 'POST' && purchaseFileMatch) {
        requireFeature(capabilities, 'receiptOcr');
        const importId = decodeRouteSegment(purchaseFileMatch[1]);
        const page = Number(purchaseFileMatch[2]);
        const revisionHeader = Number(headerValue(req, 'x-famtrack-revision'));
        const revision = Number.isSafeInteger(revisionHeader) ? revisionHeader : null;
        const mutationId = headerValue(req, 'x-famtrack-mutation-id')?.trim() || '';
        if (!mutationId) throw Object.assign(new Error('Mutation id is required for receipt uploads'), { status: 428 });
        const bytes = await readBinaryBody(req, MAX_RECEIPT_BYTES);
        const info = inspectReceiptImage(bytes, headerValue(req, 'content-type'));
        const declaredHash = headerValue(req, 'x-famtrack-file-sha256')?.trim().toLowerCase();
        if (!declaredHash || !/^[a-f0-9]{64}$/.test(declaredHash)) throw badRequest('Receipt image hash is required');
        if (declaredHash !== info.sha256) throw badRequest('Receipt image hash does not match its command envelope');

        const rawData = db.getAppData(context.familyId, context.actor);
        // Assert actor visibility before writing anything to disk.
        const visibleJob = purchaseImportsForActor(rawData, context.actor).find(job => job.id === importId);
        if (!visibleJob) throw Object.assign(new Error('Purchase import not found'), { status: 404 });
        const previousPath = rawData.purchaseImports?.find(job => job.id === importId)?.files?.find(file => file.page === page)?.path;
        const stored = await storeReceiptPage({
            root: importsDir,
            familyId: context.familyId,
            importId,
            page,
            bytes,
            info
        });
        try {
            sendCommand(res, revision, context, pathname, {
                revision,
                mutationId,
                page,
                sha256: info.sha256,
                mimeType: info.mimeType,
                sizeBytes: info.sizeBytes,
                width: info.width,
                height: info.height
            }, data => attachPurchaseImportFile(data, importId, stored.file, context.actor));
        } catch (error) {
            if (stored.created) await removeReceiptFile(importsDir, stored.file.path);
            throw error;
        }
        if (previousPath && previousPath !== stored.file.path) {
            await removeReceiptFile(importsDir, previousPath).catch(() => undefined);
        }
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    const body = await readJsonBody(req);
    const revision = typeof body.revision === 'number' ? body.revision : null;
    const currentData = () => db.getAppData(context.familyId, context.actor);

    const pantryAdjustMatch = pathname.match(/^\/api\/pantry\/([^/]+)\/adjust$/);
    if (pantryAdjustMatch) {
        requireFeature(capabilities, 'pantry');
        return sendCommand(res, revision, context, pathname, body, data => adjustPantry(data, {
            ...body,
            productId: decodeRouteSegment(pantryAdjustMatch[1])
        }, context.actor));
    }
    const purchaseBarcodeMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/barcodes$/);
    if (purchaseBarcodeMatch) {
        requireFeature(capabilities, 'pantry');
        const importId = decodeRouteSegment(purchaseBarcodeMatch[1]);
        return sendCommand(res, revision, context, pathname, body, data => addPurchaseBarcode(data, { ...body, importId }, context.actor));
    }
    const purchaseProcessMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/process$/);
    if (purchaseProcessMatch) {
        requireFeature(capabilities, 'receiptOcr');
        const importId = decodeRouteSegment(purchaseProcessMatch[1]);
        sendCommand(res, revision, context, pathname, body, data => queuePurchaseImport(data, importId, context.actor));
        receiptQueue.enqueue(receiptQueueKey(context.familyId, importId));
        return;
    }
    const purchaseCancelMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/cancel$/);
    if (purchaseCancelMatch) {
        requirePurchaseImportFeature(capabilities);
        const importId = decodeRouteSegment(purchaseCancelMatch[1]);
        return sendCommand(res, revision, context, pathname, body, data => cancelPurchaseImport(data, importId, context.actor));
    }
    const purchaseUpdateMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)$/);
    if (purchaseUpdateMatch) {
        requireFeature(capabilities, 'pantry');
        const importId = decodeRouteSegment(purchaseUpdateMatch[1]);
        return sendCommand(res, revision, context, pathname, body, data => updatePurchaseImport(data, importId, body, context.actor));
    }
    const purchaseItemMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/items\/([^/]+)$/);
    if (purchaseItemMatch) {
        requireFeature(capabilities, 'pantry');
        const importId = decodeRouteSegment(purchaseItemMatch[1]);
        const id = decodeRouteSegment(purchaseItemMatch[2]);
        return sendCommand(res, revision, context, pathname, body, data => savePurchaseImportItem(data, { ...body, importId, id }, context.actor));
    }
    const purchaseConfirmMatch = pathname.match(/^\/api\/purchase-imports\/([^/]+)\/confirm$/);
    if (purchaseConfirmMatch) {
        requireFeature(capabilities, 'pantry');
        const importId = decodeRouteSegment(purchaseConfirmMatch[1]);
        return sendCommand(res, revision, context, pathname, body, data => confirmPurchaseImport(data, importId, context.actor));
    }

    switch (pathname) {
        case '/api/family/invites':
            return sendJson(res, 200, createInvite(req, context, body));
        case '/api/tasks/reorder':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => reorderTasks(data, body.tasks));
        case '/api/tasks/status':
            return sendCommand(res, revision, context, pathname, body, data => changeTaskStatus(data, {
                taskId: normalizeString(body.taskId || body.id, '', 120),
                status: body.status as TaskStatus,
                beforeTaskId: normalizeOptionalString(body.beforeTaskId, 120)
            }, context.actor));
        case '/api/ai/task-breakdown':
            return sendJson(res, 200, handleAiTaskBreakdown(context, body));
        case '/api/ai/expense-analysis':
            return sendJson(res, 200, handleAiExpenseAnalysis(context, filterForActor(currentData(), context.actor), body));
        case '/api/notes/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => saveNote(data, body.note, context.actor));
        case '/api/notes/delete':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                notes: data.notes.filter(note => note.id !== body.id)
            }));
        case '/api/tasks/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => upsertById(
                data,
                'tasks',
                normalizeTaskForSave(data, body.task, context.actor)
            ));
        case '/api/tasks/delete':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                tasks: data.tasks.filter(task => task.id !== body.id)
            }));
        case '/api/epics/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => upsertById(
                data,
                'epics',
                normalizeEpicForSave(data, body.epic, context.actor)
            ));
        case '/api/epics/delete':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                epics: data.epics.filter(epic => epic.id !== body.id),
                tasks: data.tasks.map(task => task.epicId === body.id ? { ...task, epicId: undefined } : task),
                goals: data.goals.map(goal => goal.epicId === body.id ? { ...goal, epicId: undefined } : goal)
            }));
        case '/api/transactions/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => (
                saveFinancialTransaction(data, body.transaction, context.actor)
            ));
        case '/api/accounts/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => {
                const withAccount = upsertById(data, 'accounts', body.account);
                return isObject(body.goal) ? upsertById(withAccount, 'goals', body.goal) : withAccount;
            });
        case '/api/goals/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => upsertById(data, 'goals', body.goal));
        case '/api/budgets/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                budgets: Array.isArray(body.budgets) ? body.budgets as AppData['budgets'] : data.budgets
            }));
        case '/api/users/update':
        case '/api/users/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => saveFamilyUser(data, body.user, context.actor));
        case '/api/users/archive':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => setFamilyUserActive(data, body.userId || body.id, false, context.actor));
        case '/api/users/restore':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => setFamilyUserActive(data, body.userId || body.id, true, context.actor));
        case '/api/users/check-in':
            return sendCommand(res, revision, context, pathname, body, data => checkInFamilyMember(data, context.actor));
        case '/api/users/preferences':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => (
                updateDashboardPreferences(data, body.preferences || body, context.actor)
            ));
        case '/api/routines/save':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => saveRoutine(data, body.routine || body, context.actor));
        case '/api/routines/pause':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => pauseRoutine(data, body.routineId || body.id, body.paused, context.actor));
        case '/api/routines/complete':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => completeRoutine(data, body, context.actor));
        case '/api/routines/record-unit':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => recordRoutineUnit(data, body.routineId || body.id, body.units, context.actor));
        case '/api/routines/skip':
            requireFeature(capabilities, 'routines');
            return sendCommand(res, revision, context, pathname, body, data => skipRoutine(data, body.routineId || body.id, context.actor));
        case '/api/wishlists/save':
            requireFeature(capabilities, 'wishlists');
            return sendCommand(res, revision, context, pathname, body, data => saveWishlist(data, body.wishlist || body, context.actor));
        case '/api/wishlists/items/save':
            requireFeature(capabilities, 'wishlists');
            return sendCommand(res, revision, context, pathname, body, data => saveWishlistItem(data, body.item || body, context.actor));
        case '/api/wishlists/items/delete':
            requireFeature(capabilities, 'wishlists');
            return sendCommand(res, revision, context, pathname, body, data => deleteWishlistItem(data, body.wishlistId, body.itemId || body.id, context.actor));
        case '/api/wishlists/items/reserve':
            requireFeature(capabilities, 'wishlists');
            return sendCommand(res, revision, context, pathname, body, data => setWishlistReservation(data, body.wishlistId, body.itemId || body.id, true, context.actor));
        case '/api/wishlists/items/release':
            requireFeature(capabilities, 'wishlists');
            return sendCommand(res, revision, context, pathname, body, data => setWishlistReservation(data, body.wishlistId, body.itemId || body.id, false, context.actor));
        case '/api/pantry/adjust':
            requireFeature(capabilities, 'pantry');
            return sendCommand(res, revision, context, pathname, body, data => adjustPantry(data, body, context.actor));
        case '/api/purchase-imports':
            requireFeature(capabilities, body.source === 'RECEIPT' ? 'receiptOcr' : 'pantry');
            return sendCommand(res, revision, context, pathname, body, data => createPurchaseImport(data, body, context.actor));
        case '/api/family/settings':
            return sendCommand(res, revision, context, pathname, body, data => {
                if (!isAdmin(context.actor)) throw new ForbiddenError('Only family parents can change family settings');
                return updateFamilySettings(data, body.settings);
            });
        case '/api/rewards/save':
            return sendCommand(res, revision, context, pathname, body, data => {
                if (!isAdmin(context.actor)) throw new ForbiddenError('Only family parents can manage rewards');
                return upsertById(data, 'rewards', normalizeRewardForSave(data, body.reward, context.actor));
            });
        case '/api/rewards/archive':
            return sendCommand(res, revision, context, pathname, body, data => {
                if (!isAdmin(context.actor)) throw new ForbiddenError('Only family parents can manage rewards');
                return archiveReward(data, body.rewardId || body.id);
            });
        case '/api/rewards/purchase':
            return sendCommand(res, revision, context, pathname, body, data => purchaseReward(data, body.rewardId, context.actor));
        case '/api/rewards/use':
            return sendCommand(res, revision, context, pathname, body, data => useReward(data, body.inventoryId || body.id, context.actor));
        case '/api/savings-goals/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => upsertById(data, 'savingsGoals', body.goal));
        case '/api/savings-goals/contribute':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => contributeToSavingsGoal(data, {
                goalId: body.goalId,
                sourceAccountId: body.sourceAccountId,
                amount: body.amount,
                message: body.message
            }, context.actor));
        case '/api/contributions/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                contributions: [body.contribution as AppData['contributions'][number], ...data.contributions]
            }));
        case '/api/subscriptions/save':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => upsertById(data, 'subscriptions', body.subscription));
        case '/api/subscriptions/delete':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                subscriptions: data.subscriptions.filter(subscription => subscription.id !== body.id)
            }));
        case '/api/subscriptions/pay':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => (
                paySubscription(data, body.subscriptionId || body.id, context.actor)
            ));
        case '/api/shopping/items/add':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => addShoppingItem(data, {
                id: body.id,
                title: body.title,
                category: body.category
            }, context.actor));
        case '/api/shopping/items/set-completed':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => (
                setShoppingItemCompleted(data, body.id, body.completed)
            ));
        case '/api/shopping/items/delete':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => ({
                ...data,
                shoppingList: data.shoppingList.filter(item => item.id !== body.id)
            }));
        case '/api/shopping/checkout':
            return sendAuthorizedCommand(res, revision, context, pathname, body, data => checkoutShoppingItems(data, {
                itemIds: body.itemIds,
                totalAmount: body.totalAmount,
                accountId: body.accountId
            }, context.actor));
        case '/api/batch':
            return sendJson(res, 410, {
                error: 'Snapshot batch writes are disabled; use route-scoped commands',
                code: 'BATCH_COMMAND_DISABLED'
            });
        default:
            sendJson(res, 404, { error: 'API route not found' });
    }
}

function sendCommand(
    res: ServerResponse,
    revision: number | null,
    context: RequestContext,
    pathname: string,
    body: Record<string, unknown>,
    mutator: (data: AppData) => AppData
) {
    const providedMutationId = typeof body.mutationId === 'string' ? body.mutationId.trim() : '';
    if (providedMutationId && !/^[A-Za-z0-9._:-]{8,180}$/.test(providedMutationId)) {
        throw badRequest('Mutation id has an invalid format');
    }
    const mutationId = providedMutationId || `legacy-${randomUUID()}`;
    const requestPayload = { ...body };
    delete requestPayload.revision;
    delete requestPayload.mutationId;
    const requestHash = createHash('sha256').update(canonicalJson(requestPayload)).digest('hex');
    const envelope = db.mutateCommand(context.familyId, revision, {
        mutationId,
        actorId: context.actor.id,
        operation: pathname,
        requestHash
    }, mutator, context.actor);
    res.setHeader('ETag', familyRevisionEtag(context.familyId, envelope.revision));
    sendJson(res, 200, {
        revision: envelope.revision,
        data: applyCapabilities(filterForActor(envelope.data, context.actor), capabilities),
        command: {
            mutationId,
            ...envelope.command
        }
    });
}

function sendAuthorizedCommand(
    res: ServerResponse,
    revision: number | null,
    context: RequestContext,
    pathname: string,
    body: Record<string, unknown>,
    mutator: (data: AppData) => AppData
) {
    return sendCommand(res, revision, context, pathname, body, data => {
        assertCanWrite(context.actor, pathname, body, data);
        return mutator(data);
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
        url: familyInviteUrl(publicBaseUrl(req), invite.token)
    };
}

function reorderTasks(data: AppData, rawUpdates: unknown): AppData {
    if (!Array.isArray(rawUpdates)) throw badRequest('Task reorder payload is required');
    const validStatuses = new Set<TaskStatus>(['INBOX', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'WAITING', 'DONE', 'DROPPED']);
    const updates = new Map<string, { status: TaskStatus; sortOrder: number }>();
    for (const update of rawUpdates) {
        if (!isObject(update) || typeof update.id !== 'string') continue;
        const status = validStatuses.has(update.status as TaskStatus) ? update.status as TaskStatus : undefined;
        const sortOrder = Number(update.sortOrder);
        if (!status || !Number.isFinite(sortOrder)) continue;
        updates.set(update.id, { status, sortOrder: Math.round(sortOrder) });
    }
    if (updates.size === 0) return data;

    for (const [id, update] of updates) {
        const task = data.tasks.find(item => item.id === id);
        if (!task) throw badRequest(`Task not found: ${id}`);
        if (task.status !== update.status) {
            throw badRequest('Task status changes must use /api/tasks/status');
        }
    }

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
    if (!authForActor.isInternal) {
        db.syncTelegramProfile(authForActor);
    }
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
        data: applyCapabilities(filterForActor(envelope.data, context.actor), capabilities)
    };
}

function receiptQueueKey(familyId: string, importId: string) {
    return `${familyId}\n${importId}`;
}

async function processReceiptQueueKey(key: string) {
    const separator = key.indexOf('\n');
    if (separator < 1) return;
    const familyId = key.slice(0, separator);
    const importId = key.slice(separator + 1);
    let data = db.getAppData(familyId);
    let job = data.purchaseImports?.find(candidate => candidate.id === importId);
    if (!job || job.status !== 'QUEUED') return;

    internalReceiptMutation(familyId, importId, 'claim', { retryCount: job.retryCount }, current => (
        claimPurchaseImport(current, importId)
    ));
    data = db.getAppData(familyId);
    job = data.purchaseImports?.find(candidate => candidate.id === importId);
    if (!job || job.status !== 'PROCESSING') return;

    try {
        const result = await receiptOcrClient.recognize(job.files || []);
        internalReceiptMutation(familyId, importId, 'result', result, current => (
            applyPurchaseImportOcr(current, importId, result)
        ));
    } catch (error) {
        const ocrError = error instanceof ReceiptOcrError
            ? error
            : Object.assign(new Error('Receipt processing failed'), {
                code: typeof (error as { status?: unknown })?.status === 'number' && (error as { status: number }).status < 500
                    ? 'OCR_RESULT_REJECTED'
                    : 'OCR_INTERNAL_ERROR',
                retryable: !(typeof (error as { status?: unknown })?.status === 'number' && (error as { status: number }).status < 500)
            });
        const failed = internalReceiptMutation(familyId, importId, 'failure', {
            code: ocrError.code,
            retryable: ocrError.retryable
        }, current => failPurchaseImport(current, importId, ocrError.code, ocrError.retryable));
        const failedJob = failed.data.purchaseImports?.find(candidate => candidate.id === importId);
        if (failedJob?.status === 'FAILED_RETRYABLE') scheduleReceiptRetry(familyId, importId, failedJob.retryCount);
    }
}

function internalReceiptMutation(
    familyId: string,
    importId: string,
    stage: 'claim' | 'result' | 'failure' | 'recover' | 'retry' | 'retention',
    payload: unknown,
    mutator: (data: AppData) => AppData
) {
    const current = db.getAppData(familyId);
    const job = current.purchaseImports?.find(candidate => candidate.id === importId);
    if (!job) throw Object.assign(new Error('Purchase import not found'), { status: 404 });
    const actor = current.members.find(member => member.id === job.actorId) || current.currentUser;
    const requestHash = createHash('sha256').update(canonicalJson(payload)).digest('hex');
    const mutationDigest = createHash('sha256')
        .update(`${familyId}:${importId}:${stage}:${job.status}:${job.updatedAt}:${requestHash}`)
        .digest('hex')
        .slice(0, 32);
    return db.mutateCommand(familyId, db.getRevision(familyId), {
        mutationId: `ocr-${stage}-${mutationDigest}`,
        actorId: actor.id,
        operation: `/api/internal/purchase-imports/${importId}/${stage}`,
        requestHash
    }, mutator, actor);
}

function scheduleReceiptRetry(familyId: string, importId: string, retryCount: number) {
    const delay = Math.min(30_000, 1_000 * 2 ** Math.max(0, retryCount - 1));
    const timer = setTimeout(() => {
        try {
            const data = db.getAppData(familyId);
            const job = data.purchaseImports?.find(candidate => candidate.id === importId);
            if (!job || job.status !== 'FAILED_RETRYABLE') return;
            const actor = data.members.find(member => member.id === job.actorId) || data.currentUser;
            internalReceiptMutation(familyId, importId, 'retry', { retryCount: job.retryCount }, current => (
                queuePurchaseImport(current, importId, actor)
            ));
            receiptQueue.enqueue(receiptQueueKey(familyId, importId));
        } catch (error) {
            console.error(JSON.stringify({
                level: 'error',
                event: 'receipt_retry_failed',
                importId,
                error: error instanceof Error ? error.message : 'Unknown retry error'
            }));
        }
    }, delay);
    timer.unref();
}

async function recoverReceiptQueue() {
    for (const familyId of db.listFamilyIds()) {
        let data = db.getAppData(familyId);
        for (const candidate of data.purchaseImports || []) {
            if (candidate.status === 'PROCESSING') {
                internalReceiptMutation(familyId, candidate.id, 'recover', {}, current => (
                    recoverInterruptedPurchaseImport(current, candidate.id)
                ));
            }
        }
        data = db.getAppData(familyId);
        for (const candidate of data.purchaseImports || []) {
            if (candidate.status === 'QUEUED') receiptQueue.enqueue(receiptQueueKey(familyId, candidate.id));
            if (candidate.status === 'FAILED_RETRYABLE') scheduleReceiptRetry(familyId, candidate.id, candidate.retryCount);
        }
    }
}

async function cleanupExpiredReceiptFiles() {
    const now = Date.now();
    for (const familyId of db.listFamilyIds()) {
        const data = db.getAppData(familyId);
        for (const candidate of data.purchaseImports || []) {
            if (!candidate.retentionUntil || candidate.retentionUntil > now || !(candidate.files || []).length) continue;
            const paths = candidate.files?.map(file => file.path).filter((value): value is string => !!value) || [];
            internalReceiptMutation(familyId, candidate.id, 'retention', { retentionUntil: candidate.retentionUntil }, current => (
                expirePurchaseImportFiles(current, candidate.id, () => now)
            ));
            for (const filePath of paths) {
                await removeReceiptFile(importsDir, filePath).catch(error => {
                    console.error(JSON.stringify({
                        level: 'error',
                        event: 'receipt_retention_delete_failed',
                        importId: candidate.id,
                        error: error instanceof Error ? error.message : 'Unknown retention error'
                    }));
                });
            }
        }
    }
}

function requireFeature(flags: FeatureCapabilities, feature: keyof FeatureCapabilities) {
    if (!flags[feature]) {
        throw Object.assign(new Error(`Feature is not enabled: ${feature}`), {
            status: 404,
            code: 'FEATURE_DISABLED'
        });
    }
}

function requirePurchaseImportFeature(flags: FeatureCapabilities) {
    if (!flags.pantry && !flags.receiptOcr) requireFeature(flags, 'pantry');
}

function decodeRouteSegment(value: string) {
    try {
        const decoded = decodeURIComponent(value);
        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(decoded)) throw new Error('invalid');
        return decoded;
    } catch {
        throw badRequest('Invalid pantry product id');
    }
}

async function sendTelegramAvatar(res: ServerResponse, pathname: string, context: RequestContext) {
    const encodedUserId = pathname.slice('/api/users/'.length, -'/avatar'.length);
    let userId = '';
    try {
        userId = decodeURIComponent(encodedUserId);
    } catch {
        return sendJson(res, 404, { error: 'Avatar unavailable' });
    }
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(userId)) {
        return sendJson(res, 404, { error: 'Avatar unavailable' });
    }

    const visibleData = filterForActor(db.getAppData(context.familyId, context.actor), context.actor);
    const target = [...visibleData.members, ...(visibleData.archivedMembers || [])]
        .find(member => member.id === userId);
    if (!target?.telegramId) {
        return sendJson(res, 404, { error: 'Avatar unavailable' });
    }

    const image = await telegramAvatarService.getAvatar(target.telegramId);
    if (!image) {
        return sendJson(res, 404, { error: 'Avatar unavailable' });
    }
    const bytes = Buffer.from(image.bytes);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', String(bytes.byteLength));
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.statusCode = 200;
    res.end(bytes);
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
        avatarUrl: previous?.avatarUrl,
        streak: normalizeInteger(rawUser.streak, previous?.streak || 0),
        lastLoginDate: Object.prototype.hasOwnProperty.call(rawUser, 'lastLoginDate')
            ? normalizeOptionalString(rawUser.lastLoginDate, 32)
            : previous?.lastLoginDate
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

async function readBinaryBody(req: IncomingMessage, maximumBytes: number) {
    const declaredLength = Number(headerValue(req, 'content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        throw Object.assign(new Error('Request body is too large'), { status: 413 });
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maximumBytes) throw Object.assign(new Error('Request body is too large'), { status: 413 });
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

async function serveStatic(res: ServerResponse, rawPathname: string) {
    const pathname = decodeURIComponent(rawPathname);
    const requested = pathname === '/' ? '/index.html' : pathname;
    const root = path.resolve(staticDir);
    const safePath = path.normalize(requested).replace(/^[/\\]+/, '');
    const filePath = path.resolve(root, safePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }
    const resolved = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(root, 'index.html');

    if (!fs.existsSync(resolved)) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }

    if (path.basename(resolved) === 'index.html') {
        const connectSources = capabilities.routines
            ? "'self' https://api.open-meteo.com"
            : "'self'";
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; "
            + `img-src 'self' data: blob: https:; connect-src ${connectSources}; font-src 'self' data:; object-src 'none'; `
            + "base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
        );
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
    const proto = headerValue(req, 'x-forwarded-proto') || 'https';
    return `${proto}://${req.headers.host || 'localhost'}`;
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function handleError(
    res: ServerResponse,
    error: unknown,
    request: { requestId: string; method: string; pathname: string }
) {
    const status = error instanceof AuthError || error instanceof RevisionConflictError || error instanceof ForbiddenError
        ? error.status
        : typeof (error as { status?: unknown })?.status === 'number'
            ? (error as { status: number }).status
            : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    const code = typeof (error as { code?: unknown })?.code === 'string'
        ? (error as { code: string }).code
        : undefined;
    if (status >= 500) {
        console.error(JSON.stringify({
            level: 'error',
            event: 'request_failed',
            ...request,
            status,
            error: message
        }));
    }
    sendJson(res, status, {
        error: status >= 500 ? 'Internal server error' : message,
        ...(code ? { code } : {}),
        requestId: request.requestId
    });
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
    let outboxRetryEvents = 0;
    let outboxRetryAttempts = 0;

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
        recordOutboxRetry(retry: number) {
            outboxRetryEvents += 1;
            outboxRetryAttempts += retry;
        },
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
                outbox_retry: {
                    events: outboxRetryEvents,
                    attempts: outboxRetryAttempts
                },
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
    if (pathname.startsWith('/api/shopping/')) return 'api_shopping';
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

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (isObject(value)) {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
