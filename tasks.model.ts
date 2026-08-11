
import { FinancialGoal } from './finance.model';
import { TaskNotificationMode } from './settings.model';

// --- Types ---

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  difficulty: TaskDifficulty;
  points: number;
  assigneeId?: string;
  createdById: string;
  epicId?: string;
  subtasks: SubTask[];
  createdAt: number;
  sortOrder?: number;
  dueDate?: string; // ISO Date String YYYY-MM-DD
  reminderTime?: string; // ISO String
  visibleTo?: string[];
  isRecurring?: boolean;
  frequency?: Frequency;
  notificationMode?: TaskNotificationMode;
  completedAt?: number;
  completedById?: string;
  rewardedAt?: number;
}

export interface Epic {
  id: string;
  title: string;
  priority: Priority;
  color: string;
  isCompleted: boolean;
  goalId?: string; // Link to financial goal
  createdById?: string;
  visibleTo?: string[];
}

// --- Constants ---

export const PRIORITIES: Record<Priority, { label: string, color: string, iconColor: string }> = {
  HIGH: { label: 'Высокий', color: 'bg-red-100 text-red-700', iconColor: 'text-red-500' },
  MEDIUM: { label: 'Средний', color: 'bg-orange-100 text-orange-700', iconColor: 'text-orange-500' },
  LOW: { label: 'Низкий', color: 'bg-blue-100 text-blue-700', iconColor: 'text-blue-500' },
};

export const TASK_DIFFICULTIES: Record<TaskDifficulty, { label: string; hint: string }> = {
  EASY: { label: 'Легко', hint: 'Небольшая задача' },
  MEDIUM: { label: 'Обычно', hint: 'Нужно приложить усилия' },
  HARD: { label: 'Сложно', hint: 'Большая или неприятная задача' },
};

const TASK_XP: Record<TaskDifficulty, Record<Priority, number>> = {
  EASY: { LOW: 15, MEDIUM: 20, HIGH: 25 },
  MEDIUM: { LOW: 30, MEDIUM: 40, HIGH: 50 },
  HARD: { LOW: 55, MEDIUM: 70, HIGH: 90 },
};

export const calculateTaskXp = (difficulty: TaskDifficulty, priority: Priority): number => (
  TASK_XP[difficulty][priority]
);

// --- Utils ---

export const getNextRecurringDate = (currentDateStr: string | undefined, frequency: Frequency = 'WEEKLY'): string => {
    // If no date, start from today
    const baseDate = currentDateStr ? new Date(currentDateStr) : new Date();
    
    // If date is invalid, use today
    const date = isNaN(baseDate.getTime()) ? new Date() : baseDate;

    switch (frequency) {
        case 'DAILY':
            date.setDate(date.getDate() + 1);
            break;
        case 'WEEKLY':
            date.setDate(date.getDate() + 7);
            break;
        case 'MONTHLY':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'YEARLY':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }
    // Return YYYY-MM-DD format
    return date.toISOString().split('T')[0];
};

export const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr < today;
};

export const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
};
