import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DEFAULT_FAMILY_SETTINGS } from '../settings.model.js';
import {
    addShoppingItem,
    checkoutShoppingItems,
    contributeToSavingsGoal,
    DomainError,
    changeTaskStatus,
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

const cloneData = (): AppData => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.family = {
        id: 'family-test',
        name: 'Test family',
        ownerUserId: data.members[0].id,
        createdAt: 1,
        revision: 1,
        settings: { ...DEFAULT_FAMILY_SETTINGS }
    };
    return data;
};

const ids = () => {
    let value = 0;
    return () => String(++value);
};

test('parent completion is blocked until the family policy is enabled', () => {
    const data = cloneData();
    const parent = data.members[0];
    const child = data.members.find(member => member.role === 'CHILD')!;
    data.tasks = [{ ...data.tasks[0], id: 'child-task', assigneeId: child.id, status: 'TODO' }];

    assert.throws(
        () => changeTaskStatus(data, { taskId: 'child-task', status: 'DONE' }, parent, () => 10, ids()),
        (error: unknown) => error instanceof DomainError && error.status === 403
    );
});

test('parent completion credits the child exactly once and records the actual actor', () => {
    const data = cloneData();
    const parent = data.members[0];
    const child = data.members.find(member => member.role === 'CHILD')!;
    const startingXp = child.xp;
    data.family!.settings.allowParentTaskCompletion = true;
    data.tasks = [{ ...data.tasks[0], id: 'child-task', assigneeId: child.id, status: 'TODO', points: 75 }];

    const completed = changeTaskStatus(
        data,
        { taskId: 'child-task', status: 'DONE' },
        parent,
        () => 100,
        ids()
    );
    assert.equal(completed.members.find(member => member.id === child.id)?.xp, startingXp + 75);
    assert.equal(completed.tasks[0].completedById, parent.id);
    assert.equal(completed.tasks[0].rewardedAt, 100);
    assert.equal(completed.rewardLogs.filter(log => log.userId === child.id && log.amount === 75).length, 1);
    assert.equal(completed.events[0].payload.completedOnBehalf, true);

    const reopened = changeTaskStatus(
        completed,
        { taskId: 'child-task', status: 'IN_PROGRESS' },
        parent,
        () => 200,
        ids()
    );
    const completedAgain = changeTaskStatus(
        reopened,
        { taskId: 'child-task', status: 'DONE' },
        parent,
        () => 300,
        ids()
    );
    assert.equal(completedAgain.members.find(member => member.id === child.id)?.xp, startingXp + 75);
    assert.equal(completedAgain.rewardLogs.filter(log => log.userId === child.id && log.amount === 75).length, 1);
});

test('recurring task completion creates one clean successor', () => {
    const data = cloneData();
    const actor = data.members[0];
    data.tasks = [{
        ...data.tasks[0],
        id: 'recurring-task',
        assigneeId: actor.id,
        status: 'TODO',
        dueDate: '2026-08-10',
        reminderTime: '2026-08-10T08:00:00.000Z',
        isRecurring: true,
        frequency: 'DAILY'
    }];

    const result = changeTaskStatus(
        data,
        { taskId: 'recurring-task', status: 'DONE' },
        actor,
        () => 1000,
        ids()
    );
    const successor = result.tasks.find(task => task.id !== 'recurring-task');
    assert.equal(successor?.status, 'TODO');
    assert.equal(successor?.dueDate, '2026-08-11');
    assert.equal(successor?.reminderTime, '2026-08-11T08:00:00.000Z');
    assert.equal(successor?.rewardedAt, undefined);
});

test('normal task edits cannot forge completion metadata or DONE status', () => {
    const data = cloneData();
    const actor = data.members[0];
    data.tasks = [{
        ...data.tasks[0],
        status: 'IN_PROGRESS',
        rewardedAt: 55,
        completedById: actor.id,
        completedAt: 50
    }];

    const normalized = normalizeTaskForSave(data, {
        ...data.tasks[0],
        title: '  Updated title  ',
        status: 'DONE',
        rewardedAt: 999,
        completedAt: 999,
        completedById: 'attacker'
    }, actor, () => 100, ids());

    assert.equal(normalized.title, 'Updated title');
    assert.equal(normalized.status, 'IN_PROGRESS');
    assert.equal(normalized.rewardedAt, 55);
    assert.equal(normalized.completedAt, 50);
    assert.equal(normalized.completedById, actor.id);
});

test('task XP is derived from difficulty and priority and cannot be forged by a client', () => {
    const data = cloneData();
    const actor = data.members[0];
    const matrix = [
        ['EASY', 'LOW', 15],
        ['EASY', 'MEDIUM', 20],
        ['EASY', 'HIGH', 25],
        ['MEDIUM', 'LOW', 30],
        ['MEDIUM', 'MEDIUM', 40],
        ['MEDIUM', 'HIGH', 50],
        ['HARD', 'LOW', 55],
        ['HARD', 'MEDIUM', 70],
        ['HARD', 'HIGH', 90]
    ] as const;

    for (const [difficulty, priority, points] of matrix) {
        const normalized = normalizeTaskForSave(data, {
            id: `task-${difficulty}-${priority}`,
            title: `${difficulty} ${priority}`,
            difficulty,
            priority,
            points: 999_999
        }, actor, () => 100, ids());

        assert.equal(normalized.difficulty, difficulty);
        assert.equal(normalized.priority, priority);
        assert.equal(normalized.points, points);
    }
});

test('financial transaction edits reverse the previous effect before applying the new one', () => {
    const data = cloneData();
    const actor = data.members[0];
    const sourceBalance = data.accounts.find(account => account.id === 'ac1')!.balance;
    const destinationBalance = data.accounts.find(account => account.id === 'ac2')!.balance;

    const created = saveFinancialTransaction(data, {
        id: 'tx-editable',
        amount: 10_000,
        type: 'EXPENSE',
        categoryId: 'food',
        accountId: 'ac1',
        title: 'Groceries'
    }, actor, () => 100, ids());
    assert.equal(created.accounts.find(account => account.id === 'ac1')?.balance, sourceBalance - 10_000);

    const edited = saveFinancialTransaction(created, {
        id: 'tx-editable',
        amount: 25_000,
        type: 'TRANSFER',
        categoryId: 'transfer',
        accountId: 'ac1',
        toAccountId: 'ac2',
        title: 'Cash'
    }, actor, () => 200, ids());

    assert.equal(edited.accounts.find(account => account.id === 'ac1')?.balance, sourceBalance - 25_000);
    assert.equal(edited.accounts.find(account => account.id === 'ac2')?.balance, destinationBalance + 25_000);
    assert.equal(edited.transactions.filter(transaction => transaction.id === 'tx-editable').length, 1);
});

test('savings, subscription and shopping commands update related records atomically', () => {
    const data = cloneData();
    const actor = data.members[0];
    const initialBalance = data.accounts.find(account => account.id === 'ac1')!.balance;
    const initialGoalAmount = data.savingsGoals.find(goal => goal.id === 'sg2')!.currentAmount;

    const contributed = contributeToSavingsGoal(data, {
        goalId: 'sg2',
        sourceAccountId: 'ac1',
        amount: 50_000,
        message: 'Together'
    }, actor, () => 100, ids());
    assert.equal(contributed.accounts.find(account => account.id === 'ac1')?.balance, initialBalance - 50_000);
    assert.equal(contributed.savingsGoals.find(goal => goal.id === 'sg2')?.currentAmount, initialGoalAmount + 50_000);
    assert.equal(contributed.contributions[0].amount, 50_000);

    const subscription = contributed.subscriptions.find(item => item.id === 'sub1')!;
    const paid = paySubscription(contributed, subscription.id, actor, () => 200, ids());
    assert.equal(
        paid.accounts.find(account => account.id === 'ac1')?.balance,
        initialBalance - 50_000 - subscription.amount
    );
    assert.notEqual(
        paid.subscriptions.find(item => item.id === subscription.id)?.nextPaymentDate,
        subscription.nextPaymentDate
    );

    const withItem = addShoppingItem(paid, {
        id: 'shopping-checkout',
        title: 'Bread',
        category: 'FOOD'
    }, actor, () => 300, ids());
    const completed = setShoppingItemCompleted(withItem, 'shopping-checkout', true);
    const checkedOut = checkoutShoppingItems(completed, {
        itemIds: ['shopping-checkout'],
        totalAmount: 12_300,
        accountId: 'ac1'
    }, actor, () => 400, ids());
    assert.ok(!checkedOut.shoppingList.some(item => item.id === 'shopping-checkout'));
    assert.equal(
        checkedOut.accounts.find(account => account.id === 'ac1')?.balance,
        initialBalance - 50_000 - subscription.amount - 12_300
    );
});

test('reward catalog, purchase and use keep price and ownership server-authoritative', () => {
    const data = cloneData();
    const admin = data.members[1];
    const buyer = data.members[2];
    const reward = normalizeRewardForSave(data, {
        title: ' Семейный фильм ',
        cost: 100,
        icon: '🎬'
    }, admin, () => 10, ids());
    const withReward = { ...data, rewards: [reward] };
    const purchased = purchaseReward(withReward, reward.id, buyer, () => 20, ids());
    assert.equal(purchased.members.find(member => member.id === buyer.id)?.xp, buyer.xp - 100);
    assert.equal(purchased.inventory[0].ownerId, buyer.id);
    assert.equal(purchased.rewardLogs[0].amount, 100);

    assert.throws(
        () => useReward(purchased, purchased.inventory[0].id, admin, () => 30, ids()),
        (error: unknown) => error instanceof DomainError && error.status === 403
    );
    const used = useReward(purchased, purchased.inventory[0].id, buyer, () => 40, ids());
    assert.equal(used.inventory[0].status, 'USED');
    assert.throws(
        () => useReward(used, used.inventory[0].id, buyer, () => 50, ids()),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});

test('family settings normalize invalid delivery modes and due reminders are selected', () => {
    const data = cloneData();
    const updated = updateFamilySettings(data, {
        allowParentTaskCompletion: true,
        taskNotificationMode: 'INVALID',
        timezone: 'Europe/Moscow'
    });
    assert.equal(updated.family?.settings.allowParentTaskCompletion, true);
    assert.equal(updated.family?.settings.taskNotificationMode, 'PRIVATE');
    assert.equal(updated.family?.settings.timezone, 'Europe/Moscow');

    updated.tasks = [{
        ...updated.tasks[0],
        status: 'TODO',
        reminderTime: '2026-08-10T10:00:00.000Z',
        notificationMode: 'BOTH'
    }];
    assert.equal(reminderCandidates(updated, Date.parse('2026-08-10T10:00:01.000Z')).length, 1);
    assert.equal(reminderCandidates(updated, Date.parse('2026-08-10T09:59:59.000Z')).length, 0);
});
