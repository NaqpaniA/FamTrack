
import { AppData } from './types';
import { INITIAL_DATA } from './data';

export const DB_KEY = 'FAMILY_OS_V5_DATA';

export class LocalDatabase {
  static load(): AppData {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration helper if needed
        if (!parsed.accounts && (parsed as any).wallet) {
            parsed.accounts = [{ id: 'ac1', name: (parsed as any).wallet.name, balance: (parsed as any).wallet.balance, type: 'CARD' }];
            parsed.goals = [];
            parsed.budgets = [];
            parsed.rewardLogs = [];
        }
        return parsed;
      }
    } catch (e) {
      console.error("Failed to load data", e);
    }
    return INITIAL_DATA;
  }

  static save(data: AppData) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save data", e);
    }
  }
}

export const formatMoney = (cents: number) => {
  return (cents / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
};

export const isVisible = (item: any, userId: string) => {
    // 1. Creator always sees their own item
    if (item.createdById === userId) return true;
    
    // 2. Assignee always sees their task (if property exists)
    if (item.assigneeId === userId) return true;

    // 3. If visibleTo is undefined or empty, it's public (everyone sees)
    if (!item.visibleTo || item.visibleTo.length === 0) return true;

    // 4. Strict Check: Only people in the list can see. 
    return item.visibleTo.includes(userId);
};

export const getNextRecurringDate = (currentDateStr: string | undefined, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'WEEKLY'): string => {
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
