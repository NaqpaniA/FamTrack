import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { createAppServer } from './index.js';
import { FamTrackDatabase } from './database.js';
import type { AuthConfig } from './auth.js';

// HTTP-integration harness: starts a real createAppServer() instance on an
// ephemeral port (listen on 0) backed by its own temporary SQLite file, and
// drives it with real fetch() requests through auth, routing and the command
// pipeline down to SQLite. Every test opens its own database and server so
// tests never share state and can run in any order.

const tempDbPath = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-router-'));
    return path.join(dir, 'famtrack.sqlite');
};

const devAuthConfig = (overrides: Partial<AuthConfig> = {}): AuthConfig => ({
    mode: 'dev',
    allowedTelegramIds: new Set(),
    allowedTelegramUsernames: new Set(),
    ...overrides
});

const telegramAuthConfig = (overrides: Partial<AuthConfig> = {}): AuthConfig => ({
    mode: 'telegram',
    botToken: 'router-test-bot-token',
    allowedTelegramIds: new Set(),
    allowedTelegramUsernames: new Set(),
    ...overrides
});

async function startTestServer(authConfig: AuthConfig = devAuthConfig()) {
    const db = await FamTrackDatabase.open(tempDbPath());
    const server = createAppServer(db, {
        authConfig,
        capabilities: { routines: false, pantry: false, receiptOcr: false, wishlists: false }
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return {
        db,
        server,
        baseUrl,
        close: async () => {
            db.close();
            // fetch() keeps its socket alive by default; server.close() only
            // resolves once every connection ends, so force them shut first.
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    };
}

async function apiGet(baseUrl: string, pathname: string, headers: Record<string, string> = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, { headers });
    const data = await response.json().catch(() => undefined);
    return { status: response.status, data };
}

async function apiPost(
    baseUrl: string,
    pathname: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => undefined);
    return { status: response.status, data };
}

test('GET /api/health reports ok status and multi-family tenant mode', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const { status, data } = await apiGet(baseUrl, '/api/health');
        assert.equal(status, 200);
        assert.equal(data.tenantMode, 'multi-family');
        assert.equal(data.ok, true);
    } finally {
        await close();
    }
});

test('GET /api/app-data without Telegram auth headers is rejected in telegram mode', async () => {
    const { baseUrl, close } = await startTestServer(telegramAuthConfig());
    try {
        const { status } = await apiGet(baseUrl, '/api/app-data');
        assert.equal(status, 401);
    } finally {
        await close();
    }
});

test('POST /api/tasks/save creates a task and repeating the mutationId is a no-op duplicate', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const before = await apiGet(baseUrl, '/api/app-data');
        assert.equal(before.status, 200);
        const revision = before.data.revision;
        const mutationId = 'router-test-tasks-save-0001';
        const task = { title: 'Router harness task' };

        const first = await apiPost(baseUrl, '/api/tasks/save', { revision, mutationId, task });
        assert.equal(first.status, 200);
        assert.equal(first.data.command.duplicate, false);
        assert.ok(first.data.revision > revision);
        assert.ok(first.data.data.tasks.some((item: { title: string }) => item.title === 'Router harness task'));
        const revisionAfterFirst = first.data.revision;

        const repeat = await apiPost(baseUrl, '/api/tasks/save', { revision, mutationId, task });
        assert.equal(repeat.status, 200);
        assert.equal(repeat.data.command.duplicate, true);
        assert.equal(repeat.data.revision, revisionAfterFirst);
    } finally {
        await close();
    }
});

test('POST /api/tasks/save rejects a revision ahead of the server and rebases a stale one', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const before = await apiGet(baseUrl, '/api/app-data');
        const revision = before.data.revision;

        const aheadOfServer = await apiPost(baseUrl, '/api/tasks/save', {
            revision: revision + 10,
            mutationId: 'router-test-ahead-0001',
            task: { title: 'Ahead of server task' }
        });
        assert.equal(aheadOfServer.status, 409);

        const bump = await apiPost(baseUrl, '/api/tasks/save', {
            revision,
            mutationId: 'router-test-bump-0001',
            task: { title: 'Bump task' }
        });
        assert.equal(bump.status, 200);
        const advancedRevision = bump.data.revision;
        assert.ok(advancedRevision > revision);

        const stale = await apiPost(baseUrl, '/api/tasks/save', {
            revision,
            mutationId: 'router-test-stale-0001',
            task: { title: 'Stale rebase task' }
        });
        assert.equal(stale.status, 200);
        assert.equal(stale.data.command.rebased, true);
        assert.ok(stale.data.revision > advancedRevision);
        assert.ok(stale.data.data.tasks.some((item: { title: string }) => item.title === 'Stale rebase task'));
        assert.ok(stale.data.data.tasks.some((item: { title: string }) => item.title === 'Bump task'));
    } finally {
        await close();
    }
});

test('POST /api/rewards/purchase debits XP and adds the reward to the inventory', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const before = await apiGet(baseUrl, '/api/app-data');
        const revision = before.data.revision;
        const owner = before.data.data.currentUser;
        const reward = before.data.data.rewards.find((item: { id: string }) => item.id === 'r4');
        assert.ok(reward, 'seed data is expected to contain reward r4');

        const result = await apiPost(baseUrl, '/api/rewards/purchase', {
            revision,
            mutationId: 'router-test-purchase-0001',
            rewardId: reward.id
        });

        assert.equal(result.status, 200);
        const member = result.data.data.members.find((item: { id: string }) => item.id === owner.id);
        assert.equal(member.xp, owner.xp - reward.cost);
        assert.ok(result.data.data.inventory.some((item: { rewardId: string; ownerId: string }) => (
            item.rewardId === reward.id && item.ownerId === owner.id
        )));
    } finally {
        await close();
    }
});

test('a command without a revision is rejected with 428', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const result = await apiPost(baseUrl, '/api/tasks/save', {
            mutationId: 'router-test-no-revision-0001',
            task: { title: 'No revision task' }
        });
        assert.equal(result.status, 428);
    } finally {
        await close();
    }
});

test('a CHILD actor is forbidden on the admin-only rewards/save route', async () => {
    const internalApiSecret = 'router-test-internal-secret';
    const { baseUrl, close } = await startTestServer(devAuthConfig({ internalApiSecret }));
    try {
        const before = await apiGet(baseUrl, '/api/app-data');
        const revision = before.data.revision;
        const childTelegramId = 555001;

        const createChild = await apiPost(baseUrl, '/api/users/save', {
            revision,
            mutationId: 'router-test-create-child-0001',
            user: {
                id: 'router-test-child',
                name: 'Router Test Child',
                role: 'CHILD',
                telegramId: childTelegramId
            }
        });
        assert.equal(createChild.status, 200);

        // Dev auth mode always resolves to the default owner regardless of
        // headers, so switching the acting user for this request requires
        // internal auth (agent secret) plus the actor override header.
        const forbidden = await apiPost(baseUrl, '/api/rewards/save', {
            revision: createChild.data.revision,
            mutationId: 'router-test-child-reward-0001',
            reward: { title: 'Should be blocked', cost: 10 }
        }, {
            'x-famtrack-agent-secret': internalApiSecret,
            'x-famtrack-actor-telegram-id': String(childTelegramId)
        });
        assert.equal(forbidden.status, 403);
    } finally {
        await close();
    }
});

test('a route-scoped command only changes collections inside its declared write set', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
        const before = await apiGet(baseUrl, '/api/app-data');
        const revision = before.data.revision;
        const beforeData = before.data.data;

        // /api/tasks/save is registered with write set ['tasks'] only.
        const result = await apiPost(baseUrl, '/api/tasks/save', {
            revision,
            mutationId: 'router-test-write-set-0001',
            task: { title: 'Write set invariant task' }
        });
        assert.equal(result.status, 200);
        const afterData = result.data.data;

        assert.notDeepEqual(afterData.tasks, beforeData.tasks);
        assert.deepEqual(afterData.members, beforeData.members);
        assert.deepEqual(afterData.accounts, beforeData.accounts);
        assert.deepEqual(afterData.transactions, beforeData.transactions);
        assert.deepEqual(afterData.rewards, beforeData.rewards);
        assert.deepEqual(afterData.notes, beforeData.notes);
        assert.deepEqual(afterData.shoppingList, beforeData.shoppingList);
        assert.deepEqual(afterData.subscriptions, beforeData.subscriptions);
    } finally {
        await close();
    }
});
