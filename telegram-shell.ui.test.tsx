import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardScreen } from './dashboard.ui';
import { INITIAL_DATA } from './data';
import type { AppData } from './types';
import { installTelegramShellLifecycle, syncTelegramShellCss, TWA } from './utils';

type WebAppEvent = 'safeAreaChanged' | 'contentSafeAreaChanged' | 'viewportChanged' | 'fullscreenChanged' | 'themeChanged';

const setWebApp = (webApp: Record<string, unknown>) => {
    Object.defineProperty(window, 'Telegram', {
        configurable: true,
        value: { WebApp: webApp }
    });
};

afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('style');
    delete (window as typeof window & { Telegram?: unknown }).Telegram;
});

describe('Telegram fullscreen safe area', () => {
    it('raises a 24px Android inset to the 52px fullscreen floor', () => {
        let frame: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frame = callback;
            return 1;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const webApp = {
            platform: 'android',
            isFullscreen: false,
            safeAreaInset: { top: 24 },
            contentSafeAreaInset: { top: 0 },
            requestFullscreen: vi.fn(() => { webApp.isFullscreen = true; })
        };
        setWebApp(webApp);

        syncTelegramShellCss();
        expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe('24px');
        expect(document.documentElement.style.getPropertyValue('--tg-fullscreen-fallback-top')).toBe('0px');

        const cleanup = TWA.requestFullscreen();
        expect(webApp.requestFullscreen).toHaveBeenCalledTimes(1);
        expect(document.documentElement.style.getPropertyValue('--tg-fullscreen-fallback-top')).toBe('52px');
        frame?.(0);
        cleanup?.();
    });

    it('keeps a real inset larger than the 52px Android floor', () => {
        setWebApp({
            platform: 'android',
            isFullscreen: true,
            safeAreaInset: { top: 68 },
            contentSafeAreaInset: { top: 60 }
        });
        syncTelegramShellCss();
        expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe('68px');
        expect(document.documentElement.style.getPropertyValue('--tg-content-safe-area-inset-top')).toBe('60px');
        expect(document.documentElement.style.getPropertyValue('--tg-fullscreen-fallback-top')).toBe('52px');
    });

    it('resynchronizes immediately, on the next frame, after a defer and on Telegram events', () => {
        vi.useFakeTimers();
        let frame: FrameRequestCallback | undefined;
        const handlers = new Map<WebAppEvent, () => void>();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frame = callback;
            return 2;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const webApp = {
            platform: 'android',
            isFullscreen: false,
            safeAreaInset: { top: 0 },
            contentSafeAreaInset: { top: 0 },
            requestFullscreen: vi.fn(() => {
                webApp.isFullscreen = true;
                webApp.safeAreaInset.top = 24;
            }),
            onEvent: vi.fn((event: WebAppEvent, handler: () => void) => handlers.set(event, handler)),
            offEvent: vi.fn((event: WebAppEvent) => handlers.delete(event))
        };
        setWebApp(webApp);
        const cleanupLifecycle = installTelegramShellLifecycle();

        const cleanupRequest = TWA.requestFullscreen();
        expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe('24px');

        webApp.safeAreaInset.top = 31;
        frame?.(0);
        expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe('31px');

        webApp.contentSafeAreaInset.top = 44;
        vi.advanceTimersByTime(120);
        expect(document.documentElement.style.getPropertyValue('--tg-content-safe-area-inset-top')).toBe('44px');

        webApp.safeAreaInset.top = 72;
        handlers.get('safeAreaChanged')?.();
        expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe('72px');

        cleanupRequest?.();
        cleanupLifecycle();
    });
});

describe('dashboard header', () => {
    it('wraps a long user name while keeping the avatar fixed-size', () => {
        const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
        data.currentUser.name = 'Очень длинное составное имя пользователя для узкого экрана Telegram';
        data.capabilities = { routines: false, pantry: false, receiptOcr: false, wishlists: false };
        render(<DashboardScreen
            data={data}
            onTaskClick={() => undefined}
            onTaskStatusChange={() => undefined}
            onNavigate={() => undefined}
            onAddTask={() => undefined}
            onAddEpic={() => undefined}
            onOpenProfile={() => undefined}
            onOpenNotes={() => undefined}
            onAddNote={() => undefined}
            householdActions={{
                saveRoutine: () => undefined,
                pauseRoutine: () => undefined,
                completeRoutine: () => undefined,
                recordRoutineUnit: () => undefined,
                skipRoutine: () => undefined,
                savePreferences: () => undefined,
                saveWishlist: () => undefined,
                saveWishlistItem: () => undefined,
                deleteWishlistItem: () => undefined,
                reserveWishlistItem: () => undefined
            }}
        />);

        expect(screen.getByRole('heading', { name: /Очень длинное составное имя/ }).className).toContain('flex-wrap');
        expect(screen.getByRole('button', { name: new RegExp(`Выбрать ${data.currentUser.name}`) }).className).toContain('shrink-0');
    });
});
