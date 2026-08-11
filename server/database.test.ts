import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    FamTrackDatabase,
    MutationIdConflictError,
    RevisionConflictError,
    RevisionRequiredError
} from './database.js';
import { AuthError, validateRequestAuth } from './auth.js';
import { ForbiddenError, assertCanWrite, filterForActor, sanitizeBatchUpdates } from './rbac.js';

const tempDbPath = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-'));
    return path.join(dir, 'famtrack.sqlite');
};

const DEMO_PLAYSTATION_CLEANUP_MIGRATION = '2026-06-19-remove-demo-playstation-savings-goal';

const demoPlaystationGoal = (overrides: Record<string, unknown> = {}) => ({
    id: 'sg1',
    title: 'Sony PlayStation 5',
    targetAmount: 6000000,
    currentAmount: 1500000,
    status: 'ACTIVE' as const,
    icon: '🎮',
    createdById: 'u3',
    createdAt: Date.now(),
    ...overrides
});

const forgetDemoPlaystationCleanupMigration = (db: FamTrackDatabase) => {
    const internals = db as unknown as {
        db: { run: (sql: string, params?: unknown[]) => void };
        persist: () => void;
    };
    internals.db.run('DELETE FROM schema_migrations WHERE version = ?', [DEMO_PLAYSTATION_CLEANUP_MIGRATION]);
    internals.persist();
};

test('database migrations are idempotent and seed initial data', async () => {
    const dbPath = tempDbPath();
    const first = await FamTrackDatabase.open(dbPath);
    assert.equal(first.getRevision(), 1);
    assert.ok(first.getAppData().members.length > 0);
    assert.equal(first.integrityReport().ok, true);
    assert.ok(!first.getAppData().members.some(member => member.id === 'u4' && member.isActive !== false));
    assert.ok(!first.getAppData().savingsGoals.some(goal => goal.title === 'Sony PlayStation 5'));
    first.close();

    const second = await FamTrackDatabase.open(dbPath);
    assert.equal(second.getRevision(), 1);
    assert.ok(second.getAppData().tasks.length > 0);
    assert.ok(!second.getAppData().savingsGoals.some(goal => goal.title === 'Sony PlayStation 5'));
    second.close();
});

test('fresh production database bootstraps a clean owner workspace without demo data', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousOwnerIds = process.env.FAMTRACK_OWNER_TELEGRAM_IDS;
    const previousDemo = process.env.FAMTRACK_BOOTSTRAP_DEMO;
    process.env.NODE_ENV = 'production';
    process.env.FAMTRACK_OWNER_TELEGRAM_IDS = '424242';
    process.env.FAMTRACK_BOOTSTRAP_DEMO = '0';
    try {
        const db = await FamTrackDatabase.open(tempDbPath());
        const data = db.getAppData();
        assert.equal(data.currentUser.telegramId, 424242);
        assert.equal(data.currentUser.role, 'OWNER');
        assert.equal(data.tasks.length, 0);
        assert.equal(data.accounts.length, 0);
        assert.equal(data.transactions.length, 0);
        assert.equal(data.rewards.length, 0);
        db.close();
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousOwnerIds === undefined) delete process.env.FAMTRACK_OWNER_TELEGRAM_IDS;
        else process.env.FAMTRACK_OWNER_TELEGRAM_IDS = previousOwnerIds;
        if (previousDemo === undefined) delete process.env.FAMTRACK_BOOTSTRAP_DEMO;
        else process.env.FAMTRACK_BOOTSTRAP_DEMO = previousDemo;
    }
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

test('mutations without a loaded revision are rejected without changing data', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();

    assert.throws(
        () => db.mutate(null, data => ({ ...data, tasks: [] })),
        RevisionRequiredError
    );
    assert.equal(db.getRevision(), before.revision);
    assert.deepEqual(db.getAppData().tasks, before.data.tasks);
    db.close();
});

test('commands from two clients at the same base revision are rebased without losing either change', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    const familyId = before.data.family!.id;
    const actor = before.data.currentUser;
    const addItem = (id: string, title: string) => (data: typeof before.data) => ({
        ...data,
        shoppingList: [{
            id,
            title,
            category: 'FOOD' as const,
            addedById: actor.id,
            isCompleted: false,
            createdAt: 100
        }, ...data.shoppingList]
    });

    const first = db.mutateCommand(familyId, before.revision, {
        mutationId: 'mutation-client-one',
        actorId: actor.id,
        operation: '/api/shopping/items/add',
        requestHash: 'hash-one'
    }, addItem('concurrent-one', 'Milk'), actor);
    const second = db.mutateCommand(familyId, before.revision, {
        mutationId: 'mutation-client-two',
        actorId: actor.id,
        operation: '/api/shopping/items/add',
        requestHash: 'hash-two'
    }, addItem('concurrent-two', 'Bread'), actor);

    assert.equal(first.command.rebased, false);
    assert.equal(second.command.rebased, true);
    assert.equal(second.revision, before.revision + 2);
    assert.ok(db.getAppData().shoppingList.some(item => item.id === 'concurrent-one'));
    assert.ok(db.getAppData().shoppingList.some(item => item.id === 'concurrent-two'));
    db.close();
});

test('commands with a future revision are rejected without changing data', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    const familyId = before.data.family!.id;
    const actor = before.data.currentUser;
    let applications = 0;

    assert.throws(
        () => db.mutateCommand(familyId, before.revision + 1, {
            mutationId: 'mutation-future-revision',
            actorId: actor.id,
            operation: '/api/tasks/save',
            requestHash: 'future-payload'
        }, data => {
            applications += 1;
            return { ...data, tasks: [] };
        }, actor),
        RevisionConflictError
    );
    assert.equal(applications, 0);
    assert.equal(db.getRevision(), before.revision);
    assert.deepEqual(db.getAppData().tasks, before.data.tasks);
    db.close();
});

test('repeating the same command is idempotent and a reused mutation id is rejected', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    const familyId = before.data.family!.id;
    const actor = before.data.currentUser;
    const receipt = {
        mutationId: 'mutation-retry',
        actorId: actor.id,
        operation: '/api/budgets/save',
        requestHash: 'same-payload'
    };
    let applications = 0;
    const applyOnce = (data: typeof before.data) => {
        applications += 1;
        return { ...data, budgets: [{ categoryId: 'retry-proof', limit: 123 }, ...data.budgets] };
    };

    const first = db.mutateCommand(familyId, before.revision, receipt, applyOnce, actor);
    const repeated = db.mutateCommand(familyId, before.revision, receipt, applyOnce, actor);

    assert.equal(applications, 1);
    assert.equal(repeated.revision, first.revision);
    assert.equal(repeated.command.duplicate, true);
    assert.equal(db.getAppData().budgets.filter(item => item.categoryId === 'retry-proof').length, 1);
    assert.throws(
        () => db.mutateCommand(familyId, repeated.revision, {
            ...receipt,
            requestHash: 'different-payload'
        }, applyOnce, actor),
        MutationIdConflictError
    );
    db.close();
});

test('route-scoped commands reject writes outside their registered collections', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const before = db.exportEnvelope();
    const actor = before.data.currentUser;

    assert.throws(
        () => db.mutateCommand(before.data.family!.id, before.revision, {
            mutationId: 'mutation-write-set-violation',
            actorId: actor.id,
            operation: '/api/tasks/save',
            requestHash: 'write-set-violation'
        }, data => ({
            ...data,
            notes: [{
                id: 'note-outside-write-set',
                scope: 'FAMILY',
                contentType: 'TEXT',
                title: 'Should not persist',
                body: '',
                checklistItems: [],
                createdById: actor.id,
                isPinned: false,
                isArchived: false,
                createdAt: 1,
                updatedAt: 1
            }, ...data.notes]
        }), actor),
        /write set.*misses: notes/i
    );
    assert.equal(db.getRevision(), before.revision);
    assert.deepEqual(db.getAppData().notes, before.data.notes);
    db.close();
});

test('a disk persistence failure restores the in-memory database to the last durable state', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    const internals = db as unknown as { persist: () => void };
    const persist = internals.persist.bind(db);
    internals.persist = () => {
        throw new Error('simulated fsync failure');
    };

    assert.throws(
        () => db.mutate(before.revision, data => ({ ...data, shoppingList: [] })),
        /simulated fsync failure/
    );
    assert.equal(db.getRevision(), before.revision);
    assert.deepEqual(db.getAppData().shoppingList, before.data.shoppingList);

    internals.persist = persist;
    db.close();
    const reopened = await FamTrackDatabase.open(dbPath);
    assert.equal(reopened.getRevision(), before.revision);
    assert.deepEqual(reopened.getAppData().shoppingList, before.data.shoppingList);
    reopened.close();
});

test('reopening a migrated database preserves existing task points', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    const taskId = before.data.tasks[0].id;
    db.mutate(before.revision, data => ({
        ...data,
        tasks: data.tasks.map(task => task.id === taskId ? { ...task, points: 77 } : task)
    }));
    const internals = db as unknown as {
        db: { run: (sql: string, params?: unknown[]) => void };
        persist: () => void;
    };
    internals.db.run("UPDATE tasks SET difficulty = 'BROKEN' WHERE id = ?", [taskId]);
    internals.persist();
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const task = reopened.getAppData().tasks.find(item => item.id === taskId);
    assert.equal(task?.points, 77);
    assert.equal(task?.difficulty, 'MEDIUM');
    reopened.close();
});

test('timestamped backup restores the same revision and control record', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    const template = before.data.tasks[0];
    assert.ok(template);
    const controlTask = {
        ...template,
        id: 'backup-restore-control-task',
        title: 'Backup restore control record',
        status: 'TODO' as const,
        createdAt: Date.now()
    };
    const mutation = db.mutate(before.revision, data => ({
        ...data,
        tasks: [controlTask, ...data.tasks]
    }));
    const expectedRevision = mutation.revision;
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    assert.equal(reopened.getRevision(), expectedRevision);
    reopened.close();

    const directory = path.dirname(dbPath);
    const prefix = `${path.basename(dbPath)}.backup-`;
    const backup = fs.readdirSync(directory)
        .filter(name => name.startsWith(prefix))
        .sort()
        .at(-1);
    assert.ok(backup, 'opening an existing database must create a timestamped backup');

    const restoredPath = path.join(directory, 'restored.sqlite');
    fs.copyFileSync(path.join(directory, backup), restoredPath);
    const restored = await FamTrackDatabase.open(restoredPath);
    assert.equal(restored.getRevision(), expectedRevision);
    assert.equal(
        restored.getAppData().tasks.find(task => task.id === controlTask.id)?.title,
        controlTask.title
    );
    restored.close();
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

test('legacy demo PlayStation savings goal is removed once without deleting real goals', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    db.mutate(before.revision, data => ({
        ...data,
        savingsGoals: [demoPlaystationGoal(), ...data.savingsGoals]
    }));
    const revisionWithDemo = db.getRevision();
    forgetDemoPlaystationCleanupMigration(db);
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    assert.ok(!reopened.getAppData().savingsGoals.some(goal => goal.id === 'sg1' && goal.title === 'Sony PlayStation 5'));
    assert.ok(reopened.getAppData().savingsGoals.some(goal => goal.id === 'sg2'));
    assert.equal(reopened.getRevision(), revisionWithDemo + 1);
    reopened.close();
});

test('legacy demo PlayStation cleanup preserves edited goals and goals with contributions', async () => {
    const editedDbPath = tempDbPath();
    const editedDb = await FamTrackDatabase.open(editedDbPath);
    const editedBefore = editedDb.exportEnvelope();
    editedDb.mutate(editedBefore.revision, data => ({
        ...data,
        savingsGoals: [demoPlaystationGoal({ title: 'Steam Deck' }), ...data.savingsGoals]
    }));
    forgetDemoPlaystationCleanupMigration(editedDb);
    editedDb.close();

    const reopenedEdited = await FamTrackDatabase.open(editedDbPath);
    assert.ok(reopenedEdited.getAppData().savingsGoals.some(goal => goal.id === 'sg1' && goal.title === 'Steam Deck'));
    reopenedEdited.close();

    const contributedDbPath = tempDbPath();
    const contributedDb = await FamTrackDatabase.open(contributedDbPath);
    const contributedBefore = contributedDb.exportEnvelope();
    const demoGoal = demoPlaystationGoal();
    contributedDb.mutate(contributedBefore.revision, data => ({
        ...data,
        savingsGoals: [demoGoal, ...data.savingsGoals],
        contributions: [{
            id: 'demo-contribution',
            goalId: demoGoal.id,
            userId: data.currentUser.id,
            amount: 1000,
            date: Date.now()
        }, ...data.contributions]
    }));
    forgetDemoPlaystationCleanupMigration(contributedDb);
    contributedDb.close();

    const reopenedContributed = await FamTrackDatabase.open(contributedDbPath);
    assert.ok(reopenedContributed.getAppData().savingsGoals.some(goal => goal.id === 'sg1' && goal.title === 'Sony PlayStation 5'));
    reopenedContributed.close();
});

test('family invite tokens survive demo PlayStation cleanup migration', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const data = db.getAppData();
    const owner = data.members[0];
    const invite = db.createFamilyInvite({
        familyId: data.family?.id,
        createdById: owner.id,
        role: 'CHILD'
    });
    const before = db.exportEnvelope();
    db.mutate(before.revision, current => ({
        ...current,
        savingsGoals: [demoPlaystationGoal(), ...current.savingsGoals]
    }));
    forgetDemoPlaystationCleanupMigration(db);
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const accepted = reopened.acceptFamilyInvite(invite.token, { telegramId: 888, username: 'kid', firstName: 'Kid' });
    assert.equal(accepted.data.currentUser.role, 'CHILD');
    assert.equal(accepted.data.currentUser.familyId, data.family?.id);
    assert.ok(!reopened.getAppData().savingsGoals.some(goal => goal.id === 'sg1' && goal.title === 'Sony PlayStation 5'));
    reopened.close();
});

test('notes persist through migration storage and batch updates ignore notes', async () => {
    const dbPath = tempDbPath();
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    const actor = before.data.currentUser;
    assert.deepEqual(sanitizeBatchUpdates(actor, { notes: [] }, before.data), {});
    db.mutate(before.revision, data => ({
        ...data,
        notes: [{
            id: 'note-family',
            scope: 'FAMILY',
            contentType: 'CHECKLIST',
            title: 'Семейный план',
            body: undefined,
            checklistItems: [{ id: 'check-1', title: 'Первый пункт', isCompleted: false }],
            createdById: actor.id,
            updatedById: actor.id,
            isPinned: true,
            isArchived: false,
            createdAt: 10,
            updatedAt: 20
        }]
    }));
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const note = reopened.getAppData().notes.find(item => item.id === 'note-family');
    assert.equal(note?.title, 'Семейный план');
    assert.equal(note?.checklistItems[0]?.title, 'Первый пункт');
    reopened.close();
});

test('telegram allowlist rejects unknown users', () => {
    const initData = signInitData('secret-token', { id: 10, username: 'unknown' });

    assert.throws(
        () => validateRequestAuth(initData, {
            mode: 'telegram',
            botToken: 'secret-token',
            allowedTelegramIds: new Set([20]),
            allowedTelegramUsernames: new Set(),
            enforceAllowlist: true
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
        allowedTelegramUsernames: new Set(),
        enforceAllowlist: true
    });

    assert.equal(auth.telegramId, 20);
    assert.equal(auth.username, 'dad');
});

test('telegram initData rejects timestamps too far in the future', () => {
    const futureAuthDate = Math.floor(Date.now() / 1000) + 31;
    const initData = signInitData('secret-token', { id: 20, username: 'dad' }, futureAuthDate);

    assert.throws(
        () => validateRequestAuth(initData, {
            mode: 'telegram',
            botToken: 'secret-token',
            allowedTelegramIds: new Set(),
            allowedTelegramUsernames: new Set(),
            initDataMaxAgeSeconds: 86400
        }),
        AuthError
    );
});

test('telegram profile sync persists names and a safe HTTPS avatar URL', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const owner = db.getAppData().members[0];
    const changed = db.syncTelegramProfile({
        telegramId: 777,
        username: owner.telegramUsername?.toLowerCase(),
        firstName: 'Иван',
        lastName: 'Петров',
        photoUrl: 'https://cdn.example.test/avatar.jpg'
    });
    assert.equal(changed, true);
    const synced = db.resolveActor({ telegramId: 777 });
    assert.equal(synced?.telegramFirstName, 'Иван');
    assert.equal(synced?.telegramLastName, 'Петров');
    assert.equal(synced?.avatarUrl, 'https://cdn.example.test/avatar.jpg');

    db.syncTelegramProfile({ telegramId: 777, photoUrl: 'javascript:alert(1)' });
    assert.equal(db.resolveActor({ telegramId: 777 })?.avatarUrl, 'https://cdn.example.test/avatar.jpg');
    db.close();
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

test('personal notes are visible only to their author, including family owner', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const personalNote = {
        id: 'admin-personal-note',
        scope: 'PERSONAL' as const,
        contentType: 'TEXT' as const,
        title: 'Личное',
        body: 'Скрыто от владельца',
        checklistItems: [],
        createdById: admin.id,
        updatedById: admin.id,
        isPinned: false,
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
    };
    const familyNote = {
        ...personalNote,
        id: 'family-note',
        scope: 'FAMILY' as const,
        title: 'Семейное',
        body: 'Видно всем'
    };
    const next = {
        ...data,
        currentUser: owner,
        members: [owner, admin, ...data.members.slice(2)],
        notes: [personalNote, familyNote]
    };

    assert.ok(!filterForActor(next, owner).notes.some(note => note.id === personalNote.id));
    assert.ok(filterForActor(next, owner).notes.some(note => note.id === familyNote.id));
    assert.ok(filterForActor(next, admin).notes.some(note => note.id === personalNote.id));
    assert.ok(filterForActor(next, admin).notes.some(note => note.id === familyNote.id));
    db.close();
});

test('note write permissions separate personal and family notes', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const child = { ...data.members[2], role: 'CHILD' as const };
    const familyNote = {
        id: 'family-note',
        scope: 'FAMILY' as const,
        contentType: 'TEXT' as const,
        title: 'Семейное',
        body: 'Видно всем',
        checklistItems: [],
        createdById: child.id,
        updatedById: child.id,
        createdAt: 1,
        updatedAt: 1
    };
    const personalNote = {
        ...familyNote,
        id: 'child-personal-note',
        scope: 'PERSONAL' as const,
        title: 'Личное'
    };
    const next = { ...data, members: [owner, admin, child], notes: [familyNote, personalNote] };

    assert.doesNotThrow(() => assertCanWrite(admin, '/api/notes/save', { note: { ...familyNote, title: 'Обновлено' } }, next));
    assert.throws(
        () => assertCanWrite(owner, '/api/notes/delete', { id: personalNote.id }, next),
        ForbiddenError
    );
    assert.doesNotThrow(() => assertCanWrite(child, '/api/notes/delete', { id: personalNote.id }, next));
    assert.throws(
        () => assertCanWrite(child, '/api/notes/save', { note: { ...familyNote, title: 'Чужая правка', createdById: admin.id } }, next),
        ForbiddenError
    );
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

test('epic delete is limited to owner and admin roles', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const data = db.getAppData();
    const owner = { ...data.members[0], role: 'OWNER' as const };
    const admin = { ...data.members[1], role: 'ADMIN' as const };
    const child = { ...data.members[2], role: 'CHILD' as const };
    const epic = data.epics[0];

    assert.doesNotThrow(() => assertCanWrite(owner, '/api/epics/delete', { id: epic.id }, data));
    assert.doesNotThrow(() => assertCanWrite(admin, '/api/epics/delete', { id: epic.id }, data));
    assert.throws(
        () => assertCanWrite(child, '/api/epics/delete', { id: epic.id }, data),
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
        allowedTelegramUsernames: new Set(),
        enforceAllowlist: true
    });
    const adminAuth = validateRequestAuth(signInitData('secret-token', { id: 30, username: 'mom' }), {
        mode: 'telegram',
        botToken: 'secret-token',
        allowedTelegramIds: new Set([20, 30]),
        allowedTelegramUsernames: new Set(),
        enforceAllowlist: true
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

test('family invite creates isolated second family and cannot join a second family in v1', async () => {
    const db = await FamTrackDatabase.open(tempDbPath());
    const defaultData = db.getAppData();
    const owner = defaultData.members[0];
    const invite = db.createFamilyInvite({
        familyName: 'Parents',
        createdById: owner.id,
        role: 'OWNER'
    });
    const parentAuth = { telegramId: 777, username: 'parent', firstName: 'Parent' };
    const accepted = db.acceptFamilyInvite(invite.token, parentAuth);
    const parent = accepted.data.currentUser;
    assert.ok(parent.familyId);

    assert.notEqual(parent.familyId, defaultData.family?.id);
    assert.equal(accepted.data.members.length, 1);
    assert.equal(accepted.data.tasks.length, 0);

    const before = db.exportEnvelope(parent);
    db.mutate(parent.familyId, before.revision, data => ({
        ...data,
        tasks: [{
            id: 'parents-task',
            title: 'Parents only',
            status: 'TODO',
            priority: 'LOW',
            difficulty: 'EASY',
            points: 10,
            assigneeId: parent.id,
            createdById: parent.id,
            subtasks: [],
            createdAt: Date.now(),
            sortOrder: 1000
        }, ...data.tasks]
    }), parent);

    assert.equal(db.getAppData(parent).tasks.some(task => task.id === 'parents-task'), true);
    assert.equal(db.getAppData(owner).tasks.some(task => task.id === 'parents-task'), false);

    const defaultInvite = db.createFamilyInvite({
        familyId: defaultData.family?.id,
        createdById: owner.id,
        role: 'CHILD'
    });
    assert.throws(
        () => db.acceptFamilyInvite(defaultInvite.token, parentAuth),
        /already belongs/
    );
    db.close();
});

function signInitData(botToken: string, user: Record<string, unknown>, authDate = 1710000000) {
    const params = new URLSearchParams({
        auth_date: String(authDate),
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
