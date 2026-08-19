import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServerAdapter, TimeoutError } from './api';
import { INITIAL_DATA } from './data';
import { MemoryOutboxPersistence } from './outbox';
import { TaskEditor } from './tasks.ui';
import type { AppData } from './types';

const cloneData = () => JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('a request that never answers', () => {
    it('gives up on its own deadline instead of hanging the queue', async () => {
        vi.useFakeTimers();
        const data = cloneData();
        const adapter = new ServerAdapter(new MemoryOutboxPersistence());

        vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })));

        const load = adapter.loadData();
        const failure = expect(load).rejects.toBeInstanceOf(TimeoutError);
        await vi.advanceTimersByTimeAsync(25_000);
        await failure;

        // The next call must still be able to run: a stuck request may not keep
        // the serialised request queue occupied forever.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ revision: 1, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })));
        await expect(adapter.loadData()).resolves.toMatchObject({ currentUser: { id: data.currentUser.id } });
    });
});

describe('the task editor save button', () => {
    const renderEditor = (onSave: (task: unknown) => Promise<unknown>) => {
        const data = cloneData();
        render(
            <TaskEditor
                task={null}
                onSave={onSave as never}
                onDelete={() => undefined}
                members={data.members}
                epics={data.epics}
                availableTasks={data.tasks}
                currentUser={data.currentUser}
            />
        );
        fireEvent.change(screen.getByLabelText('Название задачи'), { target: { value: 'Роадмап' } });
    };

    const saveButton = () => screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;

    it('returns to Сохранить when saving fails', async () => {
        vi.stubGlobal('alert', vi.fn());
        renderEditor(() => Promise.reject(new Error('нет связи')));

        fireEvent.click(saveButton());

        await waitFor(() => expect(saveButton().disabled).toBe(false));
    });

    it('lets the operator retry after a failed save', async () => {
        vi.stubGlobal('alert', vi.fn());
        const onSave = vi.fn()
            .mockRejectedValueOnce(new Error('нет связи'))
            .mockResolvedValueOnce(undefined);
        renderEditor(onSave as never);

        fireEvent.click(saveButton());
        await waitFor(() => expect(saveButton().disabled).toBe(false));
        fireEvent.click(saveButton());

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    });
});
