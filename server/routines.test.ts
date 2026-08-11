import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DEFAULT_FAMILY_SETTINGS } from '../settings.model.js';
import { FamTrackDatabase } from './database.js';
import { DomainError } from './domain.js';
import {
    completeRoutine,
    dateInTimezone,
    nextRoutineOccurrence,
    pauseRoutine,
    recordRoutineUnit,
    saveRoutine,
    skipRoutine
} from './routines.js';

const at = (iso: string) => Date.parse(iso);
const ids = () => {
    let current = 0;
    return () => `generated-${++current}`;
};
const cloneData = (): AppData => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.family = {
        id: 'routine-family',
        name: 'Routine family',
        ownerUserId: data.members[0].id,
        createdAt: 1,
        revision: 1,
        settings: { ...DEFAULT_FAMILY_SETTINGS, timezone: 'Europe/Moscow' }
    };
    data.routines = [];
    data.routineEvents = [];
    return data;
};

test('routine schedules cover weekdays, intervals, month ends and annual dates', () => {
    assert.equal(nextRoutineOccurrence({ kind: 'WEEKDAYS', weekDays: [1, 3] }, '2026-08-01', '2026-08-10'), '2026-08-12');
    assert.equal(nextRoutineOccurrence({ kind: 'INTERVAL_DAYS', interval: 3 }, '2026-08-01', '2026-08-09'), '2026-08-10');
    assert.equal(nextRoutineOccurrence({ kind: 'INTERVAL_WEEKS', interval: 2, weekDays: [2] }, '2026-08-04', '2026-08-11'), '2026-08-18');
    assert.equal(nextRoutineOccurrence({ kind: 'MONTHLY', dayOfMonth: 31 }, '2026-01-01', '2026-02-01', true), '2026-02-28');
    assert.equal(nextRoutineOccurrence({ kind: 'YEARLY', month: 2, day: 29 }, '2025-01-01', '2026-01-01', true), '2026-02-28');
    assert.equal(dateInTimezone(at('2026-08-10T21:30:00.000Z'), 'Europe/Moscow'), '2026-08-11');
});

test('scheduled completion awards matrix XP once, advances from schedule and applies streak milestones', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const created = saveRoutine(data, {
        title: 'Daily care',
        kind: 'SCHEDULED',
        schedule: { kind: 'DAILY' },
        difficulty: 'EASY',
        priority: 'HIGH',
        assignmentMode: 'FIXED',
        assigneeIds: [actor.id],
        startDate: '2026-08-10',
        timezone: 'UTC'
    }, actor, () => at('2026-08-10T08:00:00.000Z'), idFactory);
    created.routines![0].streak = 2;
    const startingXp = actor.xp;
    const taskId = created.routines![0].openTaskId!;
    const completed = completeRoutine(created, { routineId: created.routines![0].id, taskId }, actor, () => at('2026-08-10T09:00:00.000Z'), idFactory);

    assert.equal(completed.members.find(member => member.id === actor.id)?.xp, startingXp + 25 + 10);
    assert.equal(completed.routines![0].streak, 3);
    assert.equal(completed.routines![0].nextOccurrenceDate, '2026-08-11');
    assert.equal(completed.tasks.filter(task => task.routineTemplateId === completed.routines![0].id && !['DONE', 'DROPPED'].includes(task.status)).length, 1);
    assert.equal(completed.routineEvents!.find(event => event.type === 'COMPLETED')?.streakBonus, 10);
    assert.throws(
        () => completeRoutine(completed, { routineId: completed.routines![0].id, taskId }, actor, () => at('2026-08-10T10:00:00.000Z'), idFactory),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});

test('late scheduled completion resets streak and creates no missed-period backlog', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const created = saveRoutine(data, {
        presetId: 'PETS',
        assignmentMode: 'FREE',
        startDate: '2026-08-10',
        timezone: 'UTC'
    }, actor, () => at('2026-08-10T08:00:00.000Z'), idFactory);
    created.routines![0].streak = 6;
    const completed = completeRoutine(created, { routineId: created.routines![0].id }, actor, () => at('2026-08-13T08:00:00.000Z'), idFactory);

    assert.equal(completed.routines![0].streak, 0);
    assert.equal(completed.routines![0].nextOccurrenceDate, '2026-08-14');
    assert.equal(completed.routineEvents!.find(event => event.type === 'COMPLETED')?.onTime, false);
    assert.equal(completed.routineEvents!.find(event => event.type === 'COMPLETED')?.streakBonus, 0);
});

test('routine local time controls streak and end date closes the final occurrence', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const created = saveRoutine(data, {
        title: 'Evening care',
        kind: 'SCHEDULED',
        schedule: { kind: 'DAILY' },
        assignmentMode: 'FREE',
        startDate: '2026-08-11',
        endDate: '2026-08-11',
        time: '09:00',
        timezone: 'Europe/Moscow'
    }, actor, () => at('2026-08-10T22:00:00.000Z'), idFactory);
    created.routines![0].streak = 4;
    const completed = completeRoutine(created, { routineId: created.routines![0].id }, actor, () => at('2026-08-11T07:00:00.000Z'), idFactory);
    const completion = completed.routineEvents!.find(event => event.type === 'COMPLETED');
    assert.equal(completion?.onTime, false, '10:00 Moscow is late for a 09:00 occurrence');
    assert.equal(completed.routines![0].streak, 0);
    assert.equal(completed.routines![0].nextOccurrenceDate, undefined);
    assert.equal(completed.routines![0].openTaskId, undefined);
    assert.equal(completed.tasks.filter(task => task.routineTemplateId === completed.routines![0].id && !['DONE', 'DROPPED'].includes(task.status)).length, 0);
});

test('accumulator units are credited in bounded batches without double reward', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const created = saveRoutine(data, {
        presetId: 'TRASH',
        assignmentMode: 'FIXED',
        assigneeIds: [actor.id],
        timezone: 'UTC'
    }, actor, () => at('2026-08-10T08:00:00.000Z'), idFactory);
    const withUnits = recordRoutineUnit(created, created.routines![0].id, 4, actor, () => at('2026-08-10T09:00:00.000Z'), idFactory);
    const startingXp = actor.xp;
    const firstBatch = completeRoutine(withUnits, { routineId: withUnits.routines![0].id, units: 3 }, actor, () => at('2026-08-10T10:00:00.000Z'), idFactory);
    assert.equal(firstBatch.routines![0].accumulatedUnits, 1);
    assert.equal(firstBatch.members.find(member => member.id === actor.id)?.xp, startingXp + 60);
    const secondBatch = completeRoutine(firstBatch, { routineId: firstBatch.routines![0].id, units: 1 }, actor, () => at('2026-08-10T11:00:00.000Z'), idFactory);
    assert.equal(secondBatch.routines![0].accumulatedUnits, 0);
    assert.equal(secondBatch.members.find(member => member.id === actor.id)?.xp, startingXp + 80);
    assert.throws(
        () => completeRoutine(secondBatch, { routineId: secondBatch.routines![0].id, units: 1 }, actor, () => at('2026-08-10T12:00:00.000Z'), idFactory),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});

test('pause and skip preserve a single open occurrence and round robin ignores inactive members', () => {
    const data = cloneData();
    const actor = data.members[0];
    const second = data.members[1];
    const idFactory = ids();
    const created = saveRoutine(data, {
        title: 'Rotate',
        kind: 'SCHEDULED',
        schedule: { kind: 'DAILY' },
        assignmentMode: 'ROUND_ROBIN',
        assigneeIds: [actor.id, second.id],
        startDate: '2026-08-10',
        timezone: 'UTC'
    }, actor, () => at('2026-08-10T08:00:00.000Z'), idFactory);
    const paused = pauseRoutine(created, created.routines![0].id, true, actor, () => 2, idFactory);
    assert.equal(paused.tasks.find(task => task.id === paused.routines![0].openTaskId)?.status, 'WAITING');
    const resumed = pauseRoutine(paused, paused.routines![0].id, false, actor, () => 3, idFactory);
    resumed.members = resumed.members.map(member => member.id === second.id ? { ...member, isActive: false } : member);
    const skipped = skipRoutine(resumed, resumed.routines![0].id, actor, () => at('2026-08-10T09:00:00.000Z'), idFactory);
    const open = skipped.tasks.find(task => task.id === skipped.routines![0].openTaskId);
    assert.equal(open?.assigneeId, actor.id);
    assert.equal(skipped.tasks.filter(task => task.routineTemplateId === skipped.routines![0].id && !['DONE', 'DROPPED'].includes(task.status)).length, 1);
});

test('routine command persists only its registered collections and survives reopen', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-routine-'));
    const dbPath = path.join(directory, 'famtrack.sqlite');
    const db = await FamTrackDatabase.open(dbPath);
    const before = db.exportEnvelope();
    const actor = before.data.currentUser;
    const saved = db.mutateCommand(before.data.family!.id, before.revision, {
        mutationId: 'mutation-routine-save-contract',
        actorId: actor.id,
        operation: '/api/routines/save',
        requestHash: 'routine-save-contract'
    }, data => saveRoutine(data, {
        presetId: 'PLANTS',
        assignmentMode: 'FREE',
        timezone: 'UTC'
    }, actor, () => at('2026-08-10T08:00:00.000Z'), ids()), actor);
    assert.equal(saved.data.routines?.length, 1);
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    assert.equal(reopened.getAppData().routines?.[0].title, 'Полить растения');
    assert.equal(reopened.getAppData().tasks.filter(task => !!task.routineTemplateId).length, 1);
    reopened.close();
});
