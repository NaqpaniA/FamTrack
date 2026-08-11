import { randomUUID } from 'node:crypto';
import type { AppData } from '../types.js';
import type { User, RewardLog } from '../family.model.js';
import { calculateLevel } from '../family.model.js';
import type { Priority, Task, TaskDifficulty } from '../tasks.model.js';
import { calculateTaskXp } from '../tasks.model.js';
import type {
    RoutineAssignmentMode,
    RoutineEvent,
    RoutinePresetId,
    RoutineSchedule,
    RoutineSummary,
    RoutineTemplate
} from '../routines.model.js';
import { DomainError } from './domain.js';

type Clock = () => number;
type IdFactory = () => string;

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const PRESETS: Record<RoutinePresetId, Pick<RoutineTemplate, 'title' | 'kind' | 'schedule' | 'unitLabel' | 'difficulty' | 'priority'>> = {
    TRASH: { title: 'Вынести мусор', kind: 'ACCUMULATOR', unitLabel: 'пакет', difficulty: 'EASY', priority: 'MEDIUM' },
    DISHWASHER: { title: 'Разобрать посудомойку', kind: 'ACCUMULATOR', unitLabel: 'загрузка', difficulty: 'EASY', priority: 'MEDIUM' },
    PETS: { title: 'Позаботиться о питомцах', kind: 'SCHEDULED', schedule: { kind: 'DAILY' }, difficulty: 'EASY', priority: 'HIGH' },
    CLEANING: { title: 'Уборка дома', kind: 'SCHEDULED', schedule: { kind: 'WEEKDAYS', weekDays: [6] }, difficulty: 'HARD', priority: 'MEDIUM' },
    LAUNDRY: { title: 'Стирка', kind: 'ACCUMULATOR', unitLabel: 'загрузка', difficulty: 'MEDIUM', priority: 'MEDIUM' },
    PLANTS: { title: 'Полить растения', kind: 'SCHEDULED', schedule: { kind: 'INTERVAL_DAYS', interval: 3 }, difficulty: 'EASY', priority: 'LOW' },
    GROCERIES: { title: 'Закупить продукты', kind: 'SCHEDULED', schedule: { kind: 'WEEKDAYS', weekDays: [6] }, difficulty: 'MEDIUM', priority: 'HIGH' }
};

export const dateInTimezone = (timestamp: number, timezone: string) => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date(timestamp));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch {
        return new Date(timestamp).toISOString().slice(0, 10);
    }
};

export const timeInTimezone = (timestamp: number, timezone: string) => {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date(timestamp));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.hour}:${values.minute}`;
    } catch {
        return new Date(timestamp).toISOString().slice(11, 16);
    }
};

const dateNumber = (value: string) => Date.parse(`${value}T00:00:00.000Z`);
const dateFromNumber = (value: number) => new Date(value).toISOString().slice(0, 10);
const addDays = (value: string, days: number) => dateFromNumber(dateNumber(value) + days * DAY_MS);
const daysBetween = (from: string, to: string) => Math.round((dateNumber(to) - dateNumber(from)) / DAY_MS);
const weekday = (value: string) => new Date(`${value}T00:00:00.000Z`).getUTCDay();
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const scheduleMatches = (schedule: RoutineSchedule, date: string, anchor: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const interval = Math.max(1, Math.trunc(schedule.interval || 1));
    switch (schedule.kind) {
        case 'DAILY':
            return daysBetween(anchor, date) >= 0 && daysBetween(anchor, date) % interval === 0;
        case 'WEEKDAYS':
            return (schedule.weekDays || []).includes(weekday(date));
        case 'INTERVAL_DAYS':
            return daysBetween(anchor, date) >= 0 && daysBetween(anchor, date) % interval === 0;
        case 'INTERVAL_WEEKS': {
            const week = Math.floor(Math.max(0, daysBetween(anchor, date)) / 7);
            const selected = schedule.weekDays?.length ? schedule.weekDays : [weekday(anchor)];
            return daysBetween(anchor, date) >= 0 && week % interval === 0 && selected.includes(weekday(date));
        }
        case 'MONTHLY':
            return day === Math.min(Math.max(1, schedule.dayOfMonth || 1), daysInMonth(year, month));
        case 'YEARLY': {
            const targetMonth = Math.min(12, Math.max(1, schedule.month || 1));
            const targetDay = Math.min(Math.max(1, schedule.day || 1), daysInMonth(year, targetMonth));
            return month === targetMonth && day === targetDay;
        }
    }
};

export const nextRoutineOccurrence = (
    schedule: RoutineSchedule,
    anchor: string,
    fromDate: string,
    inclusive = false
) => {
    let candidate = inclusive ? fromDate : addDays(fromDate, 1);
    if (candidate < anchor) candidate = anchor;
    for (let offset = 0; offset < 366 * 12; offset += 1) {
        if (scheduleMatches(schedule, candidate, anchor)) return candidate;
        candidate = addDays(candidate, 1);
    }
    throw new DomainError('Routine schedule has no occurrence in the supported range', 422);
};

const normalizeTimezone = (value: unknown, fallback: string) => {
    const timezone = typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
        return timezone;
    } catch {
        return fallback;
    }
};

const normalizeSchedule = (raw: unknown, fallback?: RoutineSchedule): RoutineSchedule => {
    const input = isObject(raw) ? raw : {};
    const kind = input.kind === 'WEEKDAYS'
        || input.kind === 'INTERVAL_DAYS'
        || input.kind === 'INTERVAL_WEEKS'
        || input.kind === 'MONTHLY'
        || input.kind === 'YEARLY'
        || input.kind === 'DAILY'
        ? input.kind
        : fallback?.kind || 'DAILY';
    const weekDays = Array.isArray(input.weekDays)
        ? [...new Set(input.weekDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
        : fallback?.weekDays;
    if ((kind === 'WEEKDAYS' || kind === 'INTERVAL_WEEKS') && (!weekDays || weekDays.length === 0)) {
        throw new DomainError('At least one weekday is required');
    }
    return {
        kind,
        interval: clampInteger(input.interval, fallback?.interval || 1, 1, 365),
        weekDays,
        dayOfMonth: clampInteger(input.dayOfMonth, fallback?.dayOfMonth || 1, 1, 31),
        month: clampInteger(input.month, fallback?.month || 1, 1, 12),
        day: clampInteger(input.day, fallback?.day || 1, 1, 31)
    };
};

const normalizeTemplate = (
    data: AppData,
    raw: unknown,
    actor: User,
    now: number,
    idFactory: IdFactory
): RoutineTemplate => {
    if (!isObject(raw)) throw new DomainError('Routine payload is required');
    const routines = data.routines || [];
    const rawId = stringValue(raw.id, '', 120);
    const previous = routines.find(item => item.id === rawId);
    if (previous && !canManageRoutine(actor, previous)) {
        throw new DomainError('You are not allowed to edit this routine', 403);
    }
    const preset = typeof raw.presetId === 'string' ? PRESETS[raw.presetId as RoutinePresetId] : undefined;
    const familyTimezone = data.family?.settings.timezone || 'UTC';
    const timezone = normalizeTimezone(raw.timezone, previous?.timezone || familyTimezone);
    const today = dateInTimezone(now, timezone);
    const title = stringValue(raw.title, preset?.title || previous?.title || '', 180);
    if (!title) throw new DomainError('Routine title is required');
    const kind = raw.kind === 'ACCUMULATOR' || raw.kind === 'SCHEDULED'
        ? raw.kind
        : preset?.kind || previous?.kind || 'SCHEDULED';
    const startDate = dateValue(raw.startDate) || previous?.startDate || today;
    const endDate = dateValue(raw.endDate) || previous?.endDate;
    if (endDate && endDate < startDate) throw new DomainError('Routine end date precedes its start date');
    const activeMemberIds = new Set(data.members.filter(member => member.isActive !== false).map(member => member.id));
    const assigneeIds = Array.isArray(raw.assigneeIds)
        ? [...new Set(raw.assigneeIds.filter((id): id is string => typeof id === 'string' && activeMemberIds.has(id)))]
        : previous?.assigneeIds || [];
    const assignmentMode: RoutineAssignmentMode = raw.assignmentMode === 'ROUND_ROBIN'
        || raw.assignmentMode === 'FREE'
        || raw.assignmentMode === 'FIXED'
        ? raw.assignmentMode
        : previous?.assignmentMode || 'FREE';
    if (assignmentMode !== 'FREE' && assigneeIds.length === 0) {
        throw new DomainError('An active assignee is required for this assignment mode');
    }
    const visibility = raw.visibility === 'PERSONAL' ? 'PERSONAL' : raw.visibility === 'FAMILY' ? 'FAMILY' : previous?.visibility || 'FAMILY';
    const schedule = kind === 'SCHEDULED'
        ? normalizeSchedule(raw.schedule, preset?.schedule || previous?.schedule)
        : undefined;
    const scheduleChanged = !previous
        || raw.schedule !== undefined
        || raw.startDate !== undefined
        || kind !== previous.kind;
    const candidateOccurrence = kind === 'SCHEDULED' && schedule
        ? !scheduleChanged && previous?.openTaskId && previous.nextOccurrenceDate
            ? previous.nextOccurrenceDate
            : nextRoutineOccurrence(schedule, startDate, today, true)
        : undefined;
    const nextOccurrenceDate = candidateOccurrence && (!endDate || candidateOccurrence <= endDate)
        ? candidateOccurrence
        : undefined;
    return {
        id: previous?.id || rawId || `routine-${idFactory()}`,
        title,
        description: optionalString(raw.description, 2000) || previous?.description,
        kind,
        schedule,
        assignmentMode,
        assigneeIds,
        lastAssigneeId: previous?.lastAssigneeId,
        difficulty: difficultyValue(raw.difficulty, preset?.difficulty || previous?.difficulty || 'MEDIUM'),
        priority: priorityValue(raw.priority, preset?.priority || previous?.priority || 'MEDIUM'),
        visibility,
        ownerId: visibility === 'PERSONAL' ? previous?.ownerId || actor.id : undefined,
        startDate,
        endDate,
        time: typeof raw.time === 'string' && TIME_PATTERN.test(raw.time) ? raw.time : previous?.time,
        timezone,
        paused: typeof raw.paused === 'boolean' ? raw.paused : previous?.paused || false,
        nextOccurrenceDate,
        openTaskId: previous?.openTaskId,
        accumulatedUnits: previous?.accumulatedUnits || 0,
        unitLabel: optionalString(raw.unitLabel, 40) || preset?.unitLabel || previous?.unitLabel,
        streak: previous?.streak || 0,
        createdById: previous?.createdById || actor.id,
        createdAt: previous?.createdAt || now,
        updatedAt: now
    };
};

const selectAssignee = (template: RoutineTemplate, data: AppData) => {
    const activeIds = new Set(data.members.filter(member => member.isActive !== false).map(member => member.id));
    const candidates = template.assigneeIds.filter(id => activeIds.has(id));
    if (template.assignmentMode === 'FREE' || candidates.length === 0) return undefined;
    if (template.assignmentMode === 'FIXED') return candidates[0];
    const previousIndex = template.lastAssigneeId ? candidates.indexOf(template.lastAssigneeId) : -1;
    return candidates[(previousIndex + 1) % candidates.length];
};

const taskForRoutine = (
    template: RoutineTemplate,
    data: AppData,
    now: number,
    idFactory: IdFactory,
    id?: string
): Task => {
    const assigneeId = selectAssignee(template, data);
    const occurrenceKey = template.kind === 'SCHEDULED'
        ? template.nextOccurrenceDate
        : `accumulator:${template.id}`;
    return {
        id: id || `task-${idFactory()}`,
        title: template.title,
        description: template.description,
        status: template.paused ? 'WAITING' : 'TODO',
        priority: template.priority,
        difficulty: template.difficulty,
        points: calculateTaskXp(template.difficulty, template.priority),
        assigneeId,
        createdById: template.createdById,
        subtasks: [],
        createdAt: now,
        dueDate: template.nextOccurrenceDate,
        visibleTo: template.visibility === 'PERSONAL' && template.ownerId ? [template.ownerId] : [],
        notificationMode: 'INHERIT',
        capturedAt: now,
        routineTemplateId: template.id,
        routineOccurrenceKey: occurrenceKey,
        routineUnits: template.accumulatedUnits,
        routineRewardedUnits: 0
    };
};

export const saveRoutine = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const now = clock();
    const template = normalizeTemplate(data, raw, actor, now, idFactory);
    const existing = (data.routines || []).find(item => item.id === template.id);
    const openTask = template.openTaskId ? data.tasks.find(task => task.id === template.openTaskId && task.status !== 'DONE' && task.status !== 'DROPPED') : undefined;
    const shouldOpen = template.kind === 'ACCUMULATOR' || !!template.nextOccurrenceDate;
    const task = shouldOpen ? taskForRoutine(template, data, now, idFactory, openTask?.id) : undefined;
    const nextTemplate = {
        ...template,
        openTaskId: task?.id,
        lastAssigneeId: task?.assigneeId || template.lastAssigneeId
    };
    const event: RoutineEvent = {
        id: `routine-event-${idFactory()}`,
        routineId: template.id,
        type: existing ? 'UPDATED' : 'CREATED',
        actorId: actor.id,
        taskId: task?.id,
        occurrenceKey: task?.routineOccurrenceKey,
        timestamp: now
    };
    return {
        ...data,
        routines: existing
            ? (data.routines || []).map(item => item.id === template.id ? nextTemplate : item)
            : [...(data.routines || []), nextTemplate],
        tasks: openTask
            ? data.tasks.map(item => item.id === openTask.id
                ? task ? { ...task, createdAt: openTask.createdAt } : { ...item, status: 'DROPPED' as const, completedAt: now }
                : item)
            : task ? [...data.tasks, task] : data.tasks,
        routineEvents: [...(data.routineEvents || []), event]
    };
};

export const pauseRoutine = (
    data: AppData,
    routineId: unknown,
    paused: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = stringValue(routineId, '', 120);
    const template = (data.routines || []).find(item => item.id === id);
    if (!template) throw new DomainError('Routine not found', 404);
    if (!canManageRoutine(actor, template)) throw new DomainError('You are not allowed to pause this routine', 403);
    if (typeof paused !== 'boolean') throw new DomainError('Paused state is required');
    const now = clock();
    return {
        ...data,
        routines: (data.routines || []).map(item => item.id === id ? { ...item, paused, updatedAt: now } : item),
        tasks: data.tasks.map(task => task.id === template.openTaskId
            ? { ...task, status: paused ? 'WAITING' : 'TODO' }
            : task),
        routineEvents: [...(data.routineEvents || []), {
            id: `routine-event-${idFactory()}`,
            routineId: id,
            type: paused ? 'PAUSED' : 'RESUMED',
            actorId: actor.id,
            taskId: template.openTaskId,
            timestamp: now
        }]
    };
};

const canComplete = (actor: User, task: Task) => (
    actor.role === 'OWNER' || actor.role === 'ADMIN' || !task.assigneeId || task.assigneeId === actor.id
);

const streakBonus = (streak: number) => {
    if (streak > 0 && streak % 30 === 0) return 100;
    if (streak === 7) return 25;
    if (streak === 3) return 10;
    return 0;
};

const creditRoutineXp = (
    data: AppData,
    creditedUserId: string,
    amount: number,
    description: string,
    timestamp: number,
    idFactory: IdFactory
) => {
    const member = data.members.find(item => item.id === creditedUserId && item.isActive !== false);
    if (!member) throw new DomainError('Routine assignee is not active', 409);
    const xp = member.xp + amount;
    const members = data.members.map(item => item.id === member.id ? { ...item, xp, level: calculateLevel(xp) } : item);
    const log: RewardLog = {
        id: `reward-log-${idFactory()}`,
        userId: member.id,
        action: 'EARNED',
        amount,
        description,
        timestamp
    };
    return { members, rewardLogs: [log, ...data.rewardLogs] };
};

export const completeRoutine = (
    data: AppData,
    input: { routineId?: unknown; taskId?: unknown; units?: unknown },
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = stringValue(input.routineId, '', 120);
    const template = (data.routines || []).find(item => item.id === id);
    if (!template) throw new DomainError('Routine not found', 404);
    if (template.visibility === 'PERSONAL' && template.ownerId !== actor.id && actor.role !== 'OWNER') {
        throw new DomainError('Routine is private', 403);
    }
    if (template.paused) throw new DomainError('Routine is paused', 409);
    const task = data.tasks.find(item => item.id === (stringValue(input.taskId, '', 120) || template.openTaskId));
    if (!task || task.routineTemplateId !== template.id) throw new DomainError('Open routine task not found', 404);
    if (!canComplete(actor, task)) throw new DomainError('You are not allowed to complete this routine', 403);
    const now = clock();
    const baseXp = calculateTaskXp(template.difficulty, template.priority);
    const creditedUserId = task.assigneeId || actor.id;

    if (template.kind === 'ACCUMULATOR') {
        const units = clampInteger(input.units, template.accumulatedUnits, 1, template.accumulatedUnits);
        if (template.accumulatedUnits <= 0 || units > template.accumulatedUnits) {
            throw new DomainError('No accumulated units are available', 409);
        }
        const nextStreak = template.streak + 1;
        const bonus = streakBonus(nextStreak);
        const award = baseXp * units + bonus;
        const credited = creditRoutineXp(data, creditedUserId, award, `Рутина: ${template.title} × ${units}`, now, idFactory);
        const remaining = template.accumulatedUnits - units;
        return {
            ...data,
            members: credited.members,
            currentUser: credited.members.find(member => member.id === data.currentUser.id) || data.currentUser,
            rewardLogs: credited.rewardLogs,
            routines: (data.routines || []).map(item => item.id === id
                ? { ...item, accumulatedUnits: remaining, streak: nextStreak, updatedAt: now }
                : item),
            tasks: data.tasks.map(item => item.id === task.id
                ? {
                    ...item,
                    routineUnits: remaining,
                    routineRewardedUnits: (item.routineRewardedUnits || 0) + units
                }
                : item),
            routineEvents: [...(data.routineEvents || []), {
                id: `routine-event-${idFactory()}`,
                routineId: id,
                type: 'COMPLETED',
                actorId: actor.id,
                taskId: task.id,
                occurrenceKey: task.routineOccurrenceKey,
                units,
                xpAwarded: award,
                streak: nextStreak,
                streakBonus: bonus,
                onTime: true,
                timestamp: now
            }]
        };
    }

    if (task.status === 'DONE' || task.rewardedAt) throw new DomainError('Routine occurrence was already rewarded', 409);
    const today = dateInTimezone(now, template.timezone);
    const occurrence = task.routineOccurrenceKey || template.nextOccurrenceDate || today;
    const onTime = today < occurrence
        || (today === occurrence && (!template.time || timeInTimezone(now, template.timezone) <= template.time));
    const nextStreak = onTime ? template.streak + 1 : 0;
    const bonus = onTime ? streakBonus(nextStreak) : 0;
    const award = baseXp + bonus;
    const credited = creditRoutineXp(data, creditedUserId, award, `Рутина: ${template.title}`, now, idFactory);
    const fromDate = occurrence > today ? occurrence : today;
    const candidateNextDate = nextRoutineOccurrence(template.schedule || { kind: 'DAILY' }, template.startDate, fromDate);
    const nextDate = !template.endDate || candidateNextDate <= template.endDate ? candidateNextDate : undefined;
    const updatedTemplate: RoutineTemplate = {
        ...template,
        nextOccurrenceDate: nextDate,
        streak: nextStreak,
        updatedAt: now,
        openTaskId: undefined,
        lastAssigneeId: task.assigneeId || template.lastAssigneeId
    };
    const successor = nextDate ? taskForRoutine(updatedTemplate, { ...data, members: credited.members }, now, idFactory) : undefined;
    updatedTemplate.openTaskId = successor?.id;
    updatedTemplate.lastAssigneeId = successor?.assigneeId || updatedTemplate.lastAssigneeId;
    return {
        ...data,
        members: credited.members,
        currentUser: credited.members.find(member => member.id === data.currentUser.id) || data.currentUser,
        rewardLogs: credited.rewardLogs,
        routines: (data.routines || []).map(item => item.id === id ? updatedTemplate : item),
        tasks: [...data.tasks.map(item => item.id === task.id
            ? { ...item, status: 'DONE' as const, completedAt: now, completedById: actor.id, rewardedAt: now }
            : item), ...(successor ? [successor] : [])],
        routineEvents: [...(data.routineEvents || []), {
            id: `routine-event-${idFactory()}`,
            routineId: id,
            type: 'COMPLETED',
            actorId: actor.id,
            taskId: task.id,
            occurrenceKey: occurrence,
            units: 1,
            xpAwarded: award,
            streak: nextStreak,
            streakBonus: bonus,
            onTime,
            timestamp: now
        }, ...(successor ? [{
            id: `routine-event-${idFactory()}`,
            routineId: id,
            type: 'OCCURRENCE_OPENED',
            actorId: actor.id,
            taskId: successor.id,
            occurrenceKey: nextDate,
            timestamp: now
        } as RoutineEvent] : [])]
    };
};

export const recordRoutineUnit = (
    data: AppData,
    routineId: unknown,
    unitsInput: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = stringValue(routineId, '', 120);
    const template = (data.routines || []).find(item => item.id === id);
    if (!template) throw new DomainError('Routine not found', 404);
    if (template.visibility === 'PERSONAL' && template.ownerId !== actor.id && actor.role !== 'OWNER') {
        throw new DomainError('Routine is private', 403);
    }
    if (template.kind !== 'ACCUMULATOR') throw new DomainError('Routine is not an accumulator', 409);
    if (template.paused) throw new DomainError('Routine is paused', 409);
    const units = clampInteger(unitsInput, 1, 1, 1000);
    const accumulatedUnits = template.accumulatedUnits + units;
    const now = clock();
    return {
        ...data,
        routines: (data.routines || []).map(item => item.id === id ? { ...item, accumulatedUnits, updatedAt: now } : item),
        tasks: data.tasks.map(task => task.id === template.openTaskId ? { ...task, routineUnits: accumulatedUnits } : task),
        routineEvents: [...(data.routineEvents || []), {
            id: `routine-event-${idFactory()}`,
            routineId: id,
            type: 'UNIT_RECORDED',
            actorId: actor.id,
            taskId: template.openTaskId,
            units,
            timestamp: now
        }]
    };
};

export const skipRoutine = (
    data: AppData,
    routineId: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = stringValue(routineId, '', 120);
    const template = (data.routines || []).find(item => item.id === id);
    if (!template || template.kind !== 'SCHEDULED') throw new DomainError('Scheduled routine not found', 404);
    if (!canManageRoutine(actor, template)) throw new DomainError('You are not allowed to skip this routine', 403);
    const task = data.tasks.find(item => item.id === template.openTaskId);
    if (!task) throw new DomainError('Open routine task not found', 404);
    const now = clock();
    const today = dateInTimezone(now, template.timezone);
    const occurrence = task.routineOccurrenceKey || template.nextOccurrenceDate || today;
    const candidateNextDate = nextRoutineOccurrence(template.schedule || { kind: 'DAILY' }, template.startDate, occurrence > today ? occurrence : today);
    const nextDate = !template.endDate || candidateNextDate <= template.endDate ? candidateNextDate : undefined;
    const updatedTemplate: RoutineTemplate = { ...template, nextOccurrenceDate: nextDate, streak: 0, openTaskId: undefined, updatedAt: now };
    const successor = nextDate ? taskForRoutine(updatedTemplate, data, now, idFactory) : undefined;
    updatedTemplate.openTaskId = successor?.id;
    return {
        ...data,
        routines: (data.routines || []).map(item => item.id === id ? updatedTemplate : item),
        tasks: [...data.tasks.map(item => item.id === task.id ? { ...item, status: 'DROPPED' as const, completedAt: now, completedById: actor.id } : item), ...(successor ? [successor] : [])],
        routineEvents: [...(data.routineEvents || []), {
            id: `routine-event-${idFactory()}`,
            routineId: id,
            type: 'SKIPPED',
            actorId: actor.id,
            taskId: task.id,
            occurrenceKey: occurrence,
            timestamp: now
        }]
    };
};

export const summarizeRoutines = (data: AppData, now = Date.now()): RoutineSummary => {
    const routines = (data.routines || []).filter(routine => !routine.paused);
    const fallbackTimezone = data.family?.settings.timezone || 'UTC';
    const items = routines.map(routine => {
        const today = dateInTimezone(now, routine.timezone || fallbackTimezone);
        if (routine.kind === 'ACCUMULATOR') {
            const state = routine.accumulatedUnits === 0 ? 'GREEN' : routine.accumulatedUnits <= 2 ? 'AMBER' : 'RED';
            return { routineId: routine.id, title: routine.title, state, accumulatedUnits: routine.accumulatedUnits } as const;
        }
        const overdueDays = routine.nextOccurrenceDate ? daysBetween(routine.nextOccurrenceDate, today) : 0;
        const state = overdueDays <= 0 ? 'GREEN' : overdueDays === 1 ? 'AMBER' : 'RED';
        return { routineId: routine.id, title: routine.title, state, dueDate: routine.nextOccurrenceDate } as const;
    });
    const amber = items.filter(item => item.state === 'AMBER').length;
    const red = items.filter(item => item.state === 'RED').length;
    const score = Math.max(0, 100 - amber * 15 - red * 35);
    const timezone = fallbackTimezone;
    const today = dateInTimezone(now, timezone);
    const completed = (data.routineEvents || []).filter(event => event.type === 'COMPLETED' && dateInTimezone(event.timestamp, timezone) === today);
    return {
        dueToday: routines.filter(routine => routine.kind === 'SCHEDULED' && routine.nextOccurrenceDate === today).length,
        overdue: routines.filter(routine => routine.kind === 'SCHEDULED' && !!routine.nextOccurrenceDate && routine.nextOccurrenceDate < today).length,
        accumulatedUnits: routines.reduce((total, routine) => total + (routine.kind === 'ACCUMULATOR' ? routine.accumulatedUnits : 0), 0),
        completedToday: completed.reduce((total, event) => total + Math.max(1, event.units || 1), 0),
        xpToday: completed.reduce((total, event) => total + Math.max(0, event.xpAwarded || 0), 0),
        houseHealth: {
            score,
            state: red > 0 || score < 60 ? 'RED' : amber > 0 || score < 85 ? 'AMBER' : 'GREEN',
            items
        }
    };
};

const stringValue = (value: unknown, fallback: string, maxLength: number) => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : fallback;
};
const optionalString = (value: unknown, maxLength: number) => stringValue(value, '', maxLength) || undefined;
const dateValue = (value: unknown) => typeof value === 'string' && DATE_PATTERN.test(value) ? value : undefined;
const priorityValue = (value: unknown, fallback: Priority): Priority => value === 'HIGH' || value === 'LOW' || value === 'MEDIUM' ? value : fallback;
const difficultyValue = (value: unknown, fallback: TaskDifficulty): TaskDifficulty => value === 'EASY' || value === 'HARD' || value === 'MEDIUM' ? value : fallback;
const clampInteger = (value: unknown, fallback: number, minimum: number, maximum: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, Math.trunc(numeric))) : fallback;
};
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const canManageRoutine = (actor: User, routine: RoutineTemplate) => (
    actor.role === 'OWNER' || actor.role === 'ADMIN' || routine.createdById === actor.id || routine.ownerId === actor.id
);
