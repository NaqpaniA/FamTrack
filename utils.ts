
import { AppData } from './types';
import { INITIAL_DATA } from './data';
import type { User } from './family.model';

export const DB_KEY = 'FAMILY_OS_V5_DATA';

// --- Telegram Web App Utils ---

// Safe access to Telegram Web App object
const getTelegramWebApp = () => (window as any).Telegram?.WebApp;
const tg = getTelegramWebApp();

export const TWA = {
  ready: () => tg?.ready(),
  expand: () => tg?.expand(),
  close: () => tg?.close(),
  enableClosingConfirmation: () => tg?.enableClosingConfirmation(),
  // Haptic Feedback
  haptic: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
      tg?.HapticFeedback.impactOccurred(style);
  },
  notification: (type: 'error' | 'success' | 'warning') => {
      tg?.HapticFeedback.notificationOccurred(type);
  },
  selection: () => {
      tg?.HapticFeedback.selectionChanged();
  },
  // Colors
  backgroundColor: tg?.themeParams?.bg_color || '#f3f4f6',
  textColor: tg?.themeParams?.text_color || '#1f2937',
  buttonColor: tg?.themeParams?.button_color || '#000000',
  buttonTextColor: tg?.themeParams?.button_text_color || '#ffffff',
  
  // User
  user: tg?.initDataUnsafe?.user,
  initData: tg?.initData,
};

export const getTelegramInitData = () => {
  return getTelegramWebApp()?.initData || '';
};

// --- Helper Utils ---

export const generateId = (): string => {
    // Simple UUID v4 replacement for browser env
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const formatMoney = (cents: number) => {
  return (cents / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
};

export const isOwner = (user?: Pick<User, 'role'> | null) => user?.role === 'OWNER';

export const isVisible = (item: any, userOrId: string | User) => {
    const user = typeof userOrId === 'string' ? undefined : userOrId;
    const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

    // Owner sees the whole family workspace.
    if (isOwner(user)) return true;

    // 1. Creator always sees their own item
    if (item.createdById === userId) return true;
    
    // 2. Assignee always sees their task (if property exists)
    if (item.assigneeId === userId) return true;

    // 3. If visibleTo is undefined or empty, it's public (everyone sees)
    if (!item.visibleTo || item.visibleTo.length === 0) return true;

    // 4. Strict Check: Only people in the list can see. 
    return item.visibleTo.includes(userId);
};

// --- Legacy Local DB (kept for Adapter fallback) ---

export class LocalDatabase {
  static load(): AppData {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Basic migration check
        if (!parsed.accounts && (parsed as any).wallet) {
            return INITIAL_DATA; // Reset if too old
        }
        // Migration for Inventory (if it doesn't exist)
        if (!parsed.inventory) {
            parsed.inventory = [];
        }
        if (!parsed.notes) {
            parsed.notes = [];
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
  
  static reset() {
      localStorage.removeItem(DB_KEY);
      window.location.reload();
  }
}
