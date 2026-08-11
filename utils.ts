
import type { User } from './family.model';

// --- Telegram Web App Utils ---

// Safe access to Telegram Web App object
const getTelegramWebApp = () => (window as any).Telegram?.WebApp;

export const TWA = {
  ready: () => getTelegramWebApp()?.ready?.(),
  expand: () => getTelegramWebApp()?.expand?.(),
  requestFullscreen: () => {
      const webApp = getTelegramWebApp();
      if (typeof webApp?.requestFullscreen !== 'function' || webApp.isFullscreen) return;
      try {
          webApp.requestFullscreen();
      } catch {
          // Older Telegram clients keep the expanded-height fallback.
      }
  },
  setHeaderColor: (color: string) => {
      try { getTelegramWebApp()?.setHeaderColor?.(color); } catch { /* unsupported client */ }
  },
  setBackgroundColor: (color: string) => {
      try { getTelegramWebApp()?.setBackgroundColor?.(color); } catch { /* unsupported client */ }
  },
  setBottomBarColor: (color: string) => {
      try { getTelegramWebApp()?.setBottomBarColor?.(color); } catch { /* unsupported client */ }
  },
  disableVerticalSwipes: () => {
      try { getTelegramWebApp()?.disableVerticalSwipes?.(); } catch { /* unsupported client */ }
  },
  close: () => getTelegramWebApp()?.close?.(),
  enableClosingConfirmation: () => getTelegramWebApp()?.enableClosingConfirmation?.(),
  // Haptic Feedback
  haptic: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  },
  notification: (type: 'error' | 'success' | 'warning') => {
      getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  },
  selection: () => {
      getTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
  },
  // Colors
  get backgroundColor() { return getTelegramWebApp()?.themeParams?.bg_color || '#f3f4f6'; },
  get textColor() { return getTelegramWebApp()?.themeParams?.text_color || '#1f2937'; },
  get buttonColor() { return getTelegramWebApp()?.themeParams?.button_color || '#000000'; },
  get buttonTextColor() { return getTelegramWebApp()?.themeParams?.button_text_color || '#ffffff'; },
  
  // User
  get user() { return getTelegramWebApp()?.initDataUnsafe?.user; },
  get initData() { return getTelegramWebApp()?.initData; },
};

export const getTelegramInitData = () => {
  return getTelegramWebApp()?.initData || '';
};

export const getTelegramStartParam = () => {
  const startParam = getTelegramWebApp()?.initDataUnsafe?.start_param;
  if (typeof startParam === 'string' && startParam) return startParam;
  return new URLSearchParams(window.location.search).get('tgWebAppStartParam') || '';
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
