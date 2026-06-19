import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FamTrackDatabase, RevisionConflictError } from './database.js';
import { AuthError, validateRequestAuth } from './auth.js';
import { ForbiddenError, assertCanWrite, filterForActor, sanitizeBatchUpdates } from './rbac.js';

const tempDbPath = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-'));
    return path.join(dir, 'famtrack.sqlite');
};

test('database migrations are idempotent and seed initial data', async () => {
    const dbPath = tempDbPath();
    const first = await FamTrackDatabase.open(dbPath);
    assert.equal(first.getRevision(), 1);
    assert.ok(first.getAppData().members.length > 0);
    assert.ok(!first.getAppData().members.some(member => member.id === 'u4' && member.isActive !== false));
    first.close();

    const second = await FamTrackDatabase.open(dbPath);
    assert.equal(second.getRevision(), 1);
    assert.ok(second.getAppData().tasks.length > 0);
    second.close();
});

test('legacy seed daughter is archived without deleting history', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    db.mutate(before.revision, data => ({
        ...data,
        members: [
            ...data.members,
            { id: 'u4', name: 'Дочь', role: 'CHILD', avatar: 'x', xp: 100, level: 2, streak: 0, isActive: true }
        ]
    }));
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const legacy = reopened.getAppData().members.find(member => member.id === 'u4');
    assert.equal(legacy?.isActive, false);
    reopened.close();
});

test('stale revisions are rejected', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    assert.throws(
        () => db.mutate(0, data => data),
        RevisionConflictError
    );
    db.close();
});

test('finance mutations persist transactionally', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    const account = before.data.accounts[0];

    db.mutate(before.revision, data => ({
        ...data,
        accounts: data.accounts.map(item => item.id === account.id
            ? { ...item, balance: item.balance - 12345 }
            : item
        ),
        transactions: [{
            id: 'test-tx',
            amount: 12345,
            type: 'EXPENSE',
            categoryId: 'food',
            accountId: account.id,
            title: 'Test expense',
            date: new Date().toISOString(),
            createdById: data.currentUser.id
        }, ...data.transactions]
    }));

    const after = db.getAppData();
    assert.equal(after.transactions[0].id, 'test-tx');
    assert.equal(after.accounts.find(item => item.id === account.id)?.balance, account.balance - 12345);
    db.close();
});

test('telegram allowlist rejects unknown users', () => {
    const initData = signInitData('secret-token', { id: 10, username: 'unknown' });

    assert.throws(
        () => validateRequestAuth(initData, {
            mode: 'telegram',
            botToken: 'secret-token',
            allowedTelegramIds: new Set([20]),
            allowedTelegramUsernames: new Set()
        }),
        AuthError
    );
});

test('telegram allowlist accepts known users', () => {
    const initData = signInitData('secret-token', { id: 20, username: 'dad' });
    const auth = validateRequestAuth(initData, {
        mode: 'telegram',
        botToken: 'secret-token',
        allowedTelegramIds: new Set([20]),
        allowedTelegramUsernames: new Set()
    });

    assert.equal(auth.telegramId, 20);
    assert.equal(auth.username, 'dad');
});

test('owner sees private family data and admin does not', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const privateTask = {
        ...data.tasks[0],
        id: 'private-owner-task',
        createdById: owner.id,
        assigneeId: owner.id,
        visibleTo: [owner.id]
    };
    const next = {
        ...data,
        currentUser: owner,
        members: [owner, admin, ...data.members.slice(2)],
        tasks: [privateTask, ...data.tasks]
    };

    assert.ok(filterForActor(next, owner).tasks.some(task => task.id === privateTask.id));
    assert.ok(!filterForActor(next, admin).tasks.some(task => task.id === privateTask.id));
    db.close();
});

test('owner receives archived members separately and non-owner only sees active members', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const archived = { ...data.members[2], id: 'archived-child', name: 'Archived', isActive: false };
    const next = {
        ...data,
        currentUser: owner,
        members: [owner, admin, data.members[2], archived]
    };

    const ownerData = filterForActor(next, owner);
    const adminData = filterForActor(next, admin);

    assert.ok(!ownerData.members.some(member => member.id === archived.id));
    assert.ok(ownerData.archivedMembers?.some(member => member.id === archived.id));
    assert.ok(!adminData.members.some(member => member.id === archived.id));
    assert.equal(adminData.archivedMembers?.length, 0);
    db.close();
});

test('family management endpoints are owner-only', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const newUser = { id: 'new-child', name: 'Kid', role: 'CHILD' as const, avatar: 'x', xp: 0, level: 1, streak: 0, isActive: true };

    assert.doesNotThrow(() => assertCanWrite(owner, '/api/users/save', { user: newUser }, data));
    assert.throws(
        () => assertCanWrite(admin, '/api/users/save', { user: newUser }, data),
        ForbiddenError
    );
    assert.throws(
        () => assertCanWrite(admin, '/api/users/archive', { id: owner.id }, data),
        ForbiddenError
    );
    db.close();
});

test('telegram requests resolve distinct current users and RBAC blocks non-owner role changes', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    db.mutate(before.revision, data => {
        const [owner, admin, ...rest] = data.members;
        return {
            ...data,
            currentUser: { ...owner, telegramId: 20, telegramUsername: 'dad' },
            members: [
                { ...owner, telegramId: 20, telegramUsername: 'dad' },
                { ...admin, telegramId: 30, telegramUsername: 'mom' },
                ...rest
            ]
        };
    });

    const data = db.getAppData();
    const ownerAuth = validateRequestAuth(signInitData('secret-token', { id: 20, username: 'dad' }), {
        mode: 'telegram',
        botToken: 'secret-token',
        allowedTelegramIds: new Set([20, 30]),
        allowedTelegramUsernames: new Set()
    });
    const adminAuth = validateRequestAuth(signInitData('secret-token', { id: 30, username: 'mom' }), {
        mode: 'telegram',
        botToken: 'secret-token',
        allowedTelegramIds: new Set([20, 30]),
        allowedTelegramUsernames: new Set()
    });
    const owner = data.members.find(member => member.telegramId === ownerAuth.telegramId)!;
    const admin = data.members.find(member => member.telegramId === adminAuth.telegramId)!;

    assert.equal(db.exportEnvelope(owner).data.currentUser.telegramId, 20);
    assert.equal(db.exportEnvelope(owner).data.currentUser.role, 'OWNER');
    assert.equal(db.exportEnvelope(admin).data.currentUser.telegramId, 30);
    assert.equal(db.exportEnvelope(admin).data.currentUser.role, 'ADMIN');

    const promotedMembers = data.members.map(member => member.telegramId === 30 ? { ...member, role: 'OWNER' as const } : member);
    assert.throws(
        () => sanitizeBatchUpdates(admin, { members: promotedMembers }, data),
        ForbiddenError
    );

    db.close();
});

function signInitData(botToken: string, user: Record<string, unknown>) {
    const params = new URLSearchParams({
        auth_date: '1710000000',
        query_id: 'test-query',
        user: JSON.stringify(user)
    });
    const dataCheckString = [...params.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    params.set('hash', hash);
    return params.toString();
}
