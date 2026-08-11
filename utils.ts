
import type { User } from './family.model';

// --- Telegram Web App Utils ---

// Safe access to Telegram Web App object
const getTelegramWebApp = () => (window as any).Telegram?.WebApp;

type TelegramInset = { top?: number; right?: number; bottom?: number; left?: number };
type TelegramThemeParams = Record<string, string | undefined>;

const INSET_SIDES = ['top', 'right', 'bottom', 'left'] as const;
const TELEGRAM_SHELL_EVENTS = [
  'safeAreaChanged',
  'contentSafeAreaChanged',
  'viewportChanged',
  'fullscreenChanged',
  'themeChanged'
] as const;

const finitePixel = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${Math.round(value)}px` : '0px'
);

const setInsetVariables = (prefix: string, inset?: TelegramInset) => {
  for (const side of INSET_SIDES) {
    document.documentElement.style.setProperty(`${prefix}-${side}`, finitePixel(inset?.[side]));
  }
};

const themeValue = (theme: TelegramThemeParams, key: string, fallback: string) => (
  typeof theme[key] === 'string' && theme[key] ? theme[key]! : fallback
);

export const syncTelegramShellCss = () => {
  const webApp = getTelegramWebApp();
  const root = document.documentElement;
  const theme = (webApp?.themeParams || {}) as TelegramThemeParams;
  const colorScheme = webApp?.colorScheme === 'dark' ? 'dark' : 'light';
  const dark = colorScheme === 'dark';

  setInsetVariables('--tg-safe-area-inset', webApp?.safeAreaInset);
  setInsetVariables('--tg-content-safe-area-inset', webApp?.contentSafeAreaInset);
  root.style.setProperty('--tg-viewport-height', finitePixel(webApp?.viewportHeight || window.innerHeight));
  root.style.setProperty('--tg-viewport-stable-height', finitePixel(webApp?.viewportStableHeight || webApp?.viewportHeight || window.innerHeight));

  const safeTop = Number(webApp?.safeAreaInset?.top) || 0;
  const contentTop = Number(webApp?.contentSafeAreaInset?.top) || 0;
  const androidFullscreenFallback = webApp?.platform === 'android'
    && webApp?.isFullscreen === true
    && Math.max(safeTop, contentTop) === 0;
  root.style.setProperty('--tg-fullscreen-fallback-top', androidFullscreenFallback ? '52px' : '0px');

  const bg = themeValue(theme, 'bg_color', dark ? '#101418' : '#f3f5f7');
  const secondary = themeValue(theme, 'secondary_bg_color', dark ? '#171d23' : '#e9eef2');
  const surface = themeValue(theme, 'section_bg_color', dark ? '#1c232b' : '#ffffff');
  const text = themeValue(theme, 'text_color', dark ? '#f4f7fa' : '#101418');
  const muted = themeValue(theme, 'hint_color', dark ? '#9aa8b5' : '#65717d');
  const accent = themeValue(theme, 'button_color', dark ? '#5ba7ff' : '#2481cc');
  const accentText = themeValue(theme, 'button_text_color', '#ffffff');
  const separator = themeValue(theme, 'section_separator_color', dark ? '#2c3742' : '#dce3e8');

  root.dataset.telegramTheme = colorScheme;
  root.style.setProperty('color-scheme', colorScheme);
  root.style.setProperty('--app-bg', bg);
  root.style.setProperty('--app-secondary-bg', secondary);
  root.style.setProperty('--app-surface', surface);
  root.style.setProperty('--app-text', text);
  root.style.setProperty('--app-muted', muted);
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-accent-text', accentText);
  root.style.setProperty('--app-border', separator);
  root.style.setProperty('--tg-theme-bg-color', bg);
  root.style.setProperty('--tg-theme-secondary-bg-color', secondary);
  root.style.setProperty('--tg-theme-section-bg-color', surface);
  root.style.setProperty('--tg-theme-text-color', text);
  root.style.setProperty('--tg-theme-hint-color', muted);
  root.style.setProperty('--tg-theme-button-color', accent);
  root.style.setProperty('--tg-theme-button-text-color', accentText);

  document.body.style.backgroundColor = bg;
  document.body.style.color = text;
  try { webApp?.setHeaderColor?.(bg); } catch { /* unsupported client */ }
  try { webApp?.setBackgroundColor?.(bg); } catch { /* unsupported client */ }
  try { webApp?.setBottomBarColor?.(surface); } catch { /* unsupported client */ }
};

export const installTelegramShellLifecycle = () => {
  const webApp = getTelegramWebApp();
  const sync = () => syncTelegramShellCss();
  const syncVisualViewport = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-visual-height', finitePixel(height));
  };

  sync();
  syncVisualViewport();
  for (const event of TELEGRAM_SHELL_EVENTS) webApp?.onEvent?.(event, sync);
  window.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('resize', syncVisualViewport);

  return () => {
    for (const event of TELEGRAM_SHELL_EVENTS) webApp?.offEvent?.(event, sync);
    window.removeEventListener('resize', syncVisualViewport);
    window.visualViewport?.removeEventListener('resize', syncVisualViewport);
  };
};

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
