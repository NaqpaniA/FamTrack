import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRoutineActionGuard } from './routine-action-guard';

const GuardProbe = ({ command }: { command: () => Promise<void> }) => {
    const guard = useRoutineActionGuard();
    const pending = guard.pendingRoutineIds.has('routine-1');
    return <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => void guard.run('routine-1', command)}>{pending ? 'Выполняю' : 'Выполнить'}</button>;
};

describe('routine command guard', () => {
    it('turns a double tap into one command for the same routine', async () => {
        let finish: (() => void) | undefined;
        const command = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
        render(<GuardProbe command={command} />);
        const button = screen.getByRole('button', { name: 'Выполнить' });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(command).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Выполняю' }).getAttribute('aria-busy')).toBe('true');
        await act(async () => finish?.());
        expect(screen.getByRole('button', { name: 'Выполнить' })).toBeTruthy();
    });
});
