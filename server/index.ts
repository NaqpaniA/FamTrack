import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FamTrackDatabase, RevisionConflictError } from './database.js';
import { AuthError, getAuthConfig, validateRequestAuth, type AuthContext } from './auth.js';
import { ForbiddenError, assertCanWrite, filterForActor, sanitizeBatchUpdates } from './rbac.js';
import type { AppData } from '../types.js';
import type { User } from '../family.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const dbPath = process.env.FAMTRACK_DB_PATH || '/data/famtrack.sqlite';
const staticDir = process.env.FAMTRACK_STATIC_DIR || path.resolve(__dirname, '../../dist');
const authConfig = getAuthConfig();

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

const db = await FamTrackDatabase.open(dbPath);

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
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
            authMode: authConfig.mode
        });
        return;
    }

    const auth = validateRequestAuth(
        headerValue(req, 'x-telegram-init-data'),
        authConfig,
        headerValue(req, 'x-famtrack-agent-secret')
    );
    const actor = resolveActor(auth, db.getAppData(), req);

    if (req.method === 'GET' && pathname === '/api/app-data') {
        sendJson(res, 200, exportForActor(actor));
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    const body = await readJsonBody(req);
    const revision = typeof body.revision === 'number' ? body.revision : null;

    switch (pathname) {
        case '/api/tasks/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'tasks', body.task));
        case '/api/tasks/delete':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => ({
                ...data,
                tasks: data.tasks.filter(task => task.id !== body.id)
            }));
        case '/api/epics/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'epics', body.epic));
        case '/api/transactions/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'transactions', body.transaction, true));
        case '/api/accounts/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'accounts', body.account));
        case '/api/goals/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'goals', body.goal));
        case '/api/budgets/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => ({
                ...data,
                budgets: Array.isArray(body.budgets) ? body.budgets as AppData['budgets'] : data.budgets
            }));
        case '/api/users/update':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => {
                const user = body.user as AppData['members'][number];
                return {
                    ...data,
                    members: data.members.map(member => member.id === user.id ? user : member),
                    currentUser: data.currentUser.id === user.id ? user : data.currentUser
                };
            });
        case '/api/reward-logs/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => ({
                ...data,
                rewardLogs: [body.log as AppData['rewardLogs'][number], ...data.rewardLogs]
            }));
        case '/api/inventory/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'inventory', body.item, true));
        case '/api/savings-goals/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'savingsGoals', body.goal));
        case '/api/contributions/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => ({
                ...data,
                contributions: [body.contribution as AppData['contributions'][number], ...data.contributions]
            }));
        case '/api/subscriptions/save':
            assertCanWrite(actor, pathname, body, db.getAppData(actor));
            return sendMutation(res, revision, actor, data => upsertById(data, 'subscriptions', body.subscription));
        case '/api/batch':
            return sendMutation(res, revision, actor, data => ({
                ...data,
                ...sanitizeBatchUpdates(actor, isObject(body.updates) ? body.updates as Partial<AppData> : {}, data)
            }));
        default:
            sendJson(res, 404, { error: 'API route not found' });
    }
}

function sendMutation(res: ServerResponse, revision: number | null, actor: User, mutator: (data: AppData) => AppData) {
    const envelope = db.mutate(revision, mutator, actor);
    sendJson(res, 200, {
        revision: envelope.revision,
        data: filterForActor(envelope.data, actor)
    });
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

async function readJsonBody(req: IncomingMessage) {
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
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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

function exportForActor(actor: User) {
    const envelope = db.exportEnvelope(actor);
    return {
        revision: envelope.revision,
        data: filterForActor(envelope.data, actor)
    };
}

function resolveActor(auth: AuthContext, data: AppData, req: IncomingMessage): User {
    if (auth.telegramId === 0) {
        return data.currentUser || data.members[0];
    }

    const headerTelegramId = Number(headerValue(req, 'x-famtrack-actor-telegram-id'));
    const telegramId = auth.isInternal && Number.isFinite(headerTelegramId)
        ? headerTelegramId
        : auth.telegramId;
    const username = auth.username?.toLowerCase();

    const actor = data.members.find(member => {
        if (telegramId && member.telegramId === telegramId) return true;
        return !!username && member.telegramUsername?.toLowerCase() === username;
    });

    if (!actor) {
        throw new ForbiddenError('Telegram user is allowed but not linked to a family profile');
    }
    return actor;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
