import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveStateIndicator } from './save-state.ui';

describe('SaveStateIndicator', () => {
    afterEach(() => vi.useRealTimers());

    it('does not render the initial SAVED state', () => {
        render(<SaveStateIndicator state={{ status: 'SAVED', pending: 0, attempts: 0 }} onRetry={() => undefined} />);
        expect(screen.queryByText('Сохранено')).toBeNull();
    });

    it('shows SAVING, then SAVED for 1.5 seconds, then removes it from the DOM', () => {
        vi.useFakeTimers();
        const { rerender } = render(<SaveStateIndicator state={{ status: 'SAVED', pending: 0, attempts: 0 }} onRetry={() => undefined} />);
        rerender(<SaveStateIndicator state={{ status: 'SAVING', pending: 1, attempts: 1 }} onRetry={() => undefined} />);
        expect(screen.getByText('Сохраняется')).toBeTruthy();

        rerender(<SaveStateIndicator state={{ status: 'SAVED', pending: 0, attempts: 0 }} onRetry={() => undefined} />);
        expect(screen.getByText('Сохранено')).toBeTruthy();
        act(() => vi.advanceTimersByTime(1_499));
        expect(screen.getByText('Сохранено')).toBeTruthy();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByText('Сохранено')).toBeNull();
    });

    it('keeps CHECK visible and invokes retry', () => {
        vi.useFakeTimers();
        const retry = vi.fn();
        render(<SaveStateIndicator state={{ status: 'CHECK', pending: 2, attempts: 5 }} onRetry={retry} />);
        const button = screen.getByRole('button', { name: /Нужна проверка/ });
        fireEvent.click(button);
        act(() => vi.advanceTimersByTime(10_000));
        expect(retry).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /Нужна проверка/ })).toBeTruthy();
    });
});
