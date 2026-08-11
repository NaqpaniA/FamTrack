import type { Priority, TaskDifficulty } from './tasks.model';

export type RoutineKind = 'SCHEDULED' | 'ACCUMULATOR';
export type RoutineScheduleKind = 'DAILY' | 'WEEKDAYS' | 'INTERVAL_DAYS' | 'INTERVAL_WEEKS' | 'MONTHLY' | 'YEARLY';
export type RoutineAssignmentMode = 'FIXED' | 'ROUND_ROBIN' | 'FREE';
export type RoutineVisibility = 'PERSONAL' | 'FAMILY';

export interface RoutineSchedule {
  kind: RoutineScheduleKind;
  interval?: number;
  weekDays?: number[];
  dayOfMonth?: number;
  month?: number;
  day?: number;
}

export interface RoutineTemplate {
  id: string;
  title: string;
  description?: string;
  kind: RoutineKind;
  schedule?: RoutineSchedule;
  assignmentMode: RoutineAssignmentMode;
  assigneeIds: string[];
  lastAssigneeId?: string;
  difficulty: TaskDifficulty;
  priority: Priority;
  visibility: RoutineVisibility;
  ownerId?: string;
  startDate: string;
  endDate?: string;
  time?: string;
  timezone: string;
  paused: boolean;
  nextOccurrenceDate?: string;
  openTaskId?: string;
  accumulatedUnits: number;
  unitLabel?: string;
  streak: number;
  createdById: string;
  createdAt: number;
  updatedAt: number;
}

export type RoutineEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'PAUSED'
  | 'RESUMED'
  | 'OCCURRENCE_OPENED'
  | 'COMPLETED'
  | 'UNIT_RECORDED'
  | 'SKIPPED'
  | 'MIGRATED';

export interface RoutineEvent {
  id: string;
  routineId: string;
  type: RoutineEventType;
  actorId: string;
  taskId?: string;
  occurrenceKey?: string;
  units?: number;
  xpAwarded?: number;
  streak?: number;
  streakBonus?: number;
  onTime?: boolean;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface HouseHealthItem {
  routineId: string;
  title: string;
  state: 'GREEN' | 'AMBER' | 'RED';
  dueDate?: string;
  accumulatedUnits?: number;
}

export interface RoutineSummary {
  dueToday: number;
  overdue: number;
  accumulatedUnits: number;
  completedToday: number;
  xpToday: number;
  houseHealth: {
    score: number;
    state: 'GREEN' | 'AMBER' | 'RED';
    items: HouseHealthItem[];
  };
}

export type RoutinePresetId = 'TRASH' | 'DISHWASHER' | 'PETS' | 'CLEANING' | 'LAUNDRY' | 'PLANTS' | 'GROCERIES';
