import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_DATA } from './data';
import type { AppData } from './types';
import type { Task, TaskStatus } from './tasks.model';
import { KanbanCard, TaskEditor, TasksScreen, type TaskOwnershipFilter } from './tasks.ui';
import { saveTaskFieldsThenStatus } from './task-save-flow';
import { useTaskActionGuard } from './task-action-guard';

const task = (id: string, title: string, status: TaskStatus, assigneeId?: string, epicId?: string): Task => ({
    id,
    title,
    status,
    priority: 'MEDIUM',
    difficulty: 'MEDIUM',
    points: 40,
    assigneeId,
    epicId,
    createdById: 'u1',
    subtasks: [],
    createdAt: Number(id.replace(/\D/g, '')) || 1
});

const taskData = () => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.tasks = [
        task('task-1', 'Моя задача ремонта', 'TODO', data.currentUser.id, 'e1'),
        task('task-2', 'Чужая задача ремонта', 'IN_PROGRESS', data.members[1].id, 'e1'),
        task('task-3', 'Чужая задача отпуска', 'WAITING', data.members[1].id, 'e2'),
        { ...task('task-4', 'Свободная рутина без исполнителя', 'TODO', undefined, 'e1'), routineTemplateId: 'routine-free' }
    ];
    return data;
};

const TasksProbe = ({ initialEpic }: { initialEpic?: string }) => {
    const [filter, setFilter] = useState<TaskOwnershipFilter>('ALL');
    const [epic, setEpic] = useState(initialEpic);
    return <TasksScreen
        data={taskData()}
        onTaskClick={() => undefined}
        onAddTask={() => undefined}
        onStatusChange={() => undefined}
        onRoutineComplete={() => undefined}
        onMoveTask={() => undefined}
        onAddEpic={() => undefined}
        onEditEpic={() => undefined}
        onEpicFilterChange={setEpic}
        activeFilterEpicId={epic}
        ownershipFilter={filter}
        onOwnershipFilterChange={setFilter}
    />;
};

describe('task ownership filter', () => {
    it('filters both kanban and list strictly by assignee', () => {
        render(<TasksProbe />);
        expect(screen.getByRole('button', { name: /Открыть задачу «Моя задача ремонта»/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Открыть задачу «Чужая задача ремонта»/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть задачу «Свободная рутина без исполнителя»' })).toBeTruthy();

        fireEvent.click(within(screen.getByRole('group', { name: 'Исполнитель задач' })).getByRole('button', { name: 'Мои' }));
        expect(screen.getByText('1 всего')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Открыть задачу «Моя задача ремонта»/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Открыть задачу «Чужая задача ремонта»/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Открыть задачу «Свободная рутина без исполнителя»' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Список задач' }));
        expect(screen.getByText('Моя задача ремонта')).toBeTruthy();
        expect(screen.queryByText('Чужая задача ремонта')).toBeNull();
        expect(screen.queryByText('Свободная рутина без исполнителя')).toBeNull();
    });

    it('updates total/project counters and keeps a selected project when it becomes empty', () => {
        render(<TasksProbe initialEpic="e2" />);
        const projectTabs = screen.getByRole('tablist', { name: 'Проекты' });
        expect(within(projectTabs).getByRole('button', { name: 'Отпуск Лето1' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('1 всего')).toBeTruthy();

        fireEvent.click(within(screen.getByRole('group', { name: 'Исполнитель задач' })).getByRole('button', { name: 'Мои' }));
        expect(screen.getByRole('heading', { name: 'Отпуск Лето' })).toBeTruthy();
        expect(screen.getByText('0 всего')).toBeTruthy();
        expect(within(projectTabs).getByRole('button', { name: 'Отпуск Лето0' }).getAttribute('aria-pressed')).toBe('true');
        expect(within(projectTabs).getByRole('button', { name: 'Все1' })).toBeTruthy();
        expect(within(projectTabs).getByRole('button', { name: 'Ремонт кухни1' })).toBeTruthy();
    });
});

describe('task status editor', () => {
    it('shows seven ordered statuses for an existing normal task and three for a new task', () => {
        const data = taskData();
        const existing = data.tasks[0];
        const props = {
            onSave: () => undefined,
            onDelete: () => undefined,
            members: data.members,
            epics: data.epics,
            availableTasks: data.tasks,
            currentUser: data.currentUser
        };
        const { rerender } = render(<TaskEditor {...props} task={existing} />);
        expect(within(screen.getByLabelText('Статус задачи')).getAllByRole('option').map(option => option.getAttribute('value'))).toEqual([
            'INBOX', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'WAITING', 'DONE', 'DROPPED'
        ]);

        rerender(<TaskEditor {...props} task={null} />);
        expect(within(screen.getByLabelText('Статус задачи')).getAllByRole('option').map(option => option.getAttribute('value'))).toEqual([
            'INBOX', 'TODO', 'WAITING'
        ]);
    });

    it('does not expose manual statuses for routine task instances', () => {
        const data = taskData();
        render(<TaskEditor
            task={{ ...data.tasks[0], routineTemplateId: 'routine-1' }}
            onSave={() => undefined}
            onDelete={() => undefined}
            members={data.members}
            epics={data.epics}
            availableTasks={data.tasks}
            currentUser={data.currentUser}
        />);
        expect(screen.queryByLabelText('Статус задачи')).toBeNull();
    });
});

describe('task save/status flow', () => {
    it('saves fields with the original status before issuing the status command', async () => {
        const data = taskData();
        const previous = data.tasks[0];
        const edited = { ...previous, priority: 'HIGH' as const, difficulty: 'HARD' as const, points: 90, status: 'DONE' as const };
        const order: string[] = [];
        const saveFields = vi.fn(async (candidate: Task) => {
            order.push(`save:${candidate.status}:${candidate.points}`);
            return { ...data, tasks: data.tasks.map(item => item.id === candidate.id ? candidate : item) };
        });
        const saveStatus = vi.fn(async (id: string, status: TaskStatus) => {
            order.push(`status:${status}`);
            return { ...data, tasks: data.tasks.map(item => item.id === id ? { ...edited, status } : item) };
        });

        const result = await saveTaskFieldsThenStatus(edited, previous, { saveFields, saveStatus });
        expect(result.kind).toBe('saved');
        expect(order).toEqual(['save:TODO:90', 'status:DONE']);
        expect(saveFields.mock.calls[0][0].status).toBe('TODO');
    });

    it('does not send status when field saving fails', async () => {
        const data = taskData();
        const previous = data.tasks[0];
        const saveStatus = vi.fn();
        const result = await saveTaskFieldsThenStatus({ ...previous, status: 'DONE' }, previous, {
            saveFields: async () => { throw new Error('save failed'); },
            saveStatus
        });
        expect(result.kind).toBe('fields-failed');
        expect(saveStatus).not.toHaveBeenCalled();
    });

    it('returns the confirmed status when fields save but status fails', async () => {
        const data = taskData();
        const previous = data.tasks[0];
        const result = await saveTaskFieldsThenStatus({ ...previous, title: 'Сохранённые поля', status: 'DONE' }, previous, {
            saveFields: async candidate => ({ ...data, tasks: data.tasks.map(item => item.id === candidate.id ? candidate : item) }),
            saveStatus: async () => { throw new Error('status failed'); }
        });
        expect(result.kind).toBe('status-failed');
        if (result.kind === 'status-failed') {
            expect(result.confirmedStatus).toBe('TODO');
            expect(result.data.tasks.find(item => item.id === previous.id)?.title).toBe('Сохранённые поля');
        }
    });

    it('keeps the editor open and restores its confirmed status after a partial failure', async () => {
        const data = taskData();
        const previous = data.tasks[0];
        const onSave = vi.fn(async () => ({
            kind: 'status-failed' as const,
            data,
            error: new Error('status failed'),
            confirmedStatus: previous.status
        }));
        render(<TaskEditor
            task={previous}
            onSave={onSave}
            onDelete={() => undefined}
            members={data.members}
            epics={data.epics}
            availableTasks={data.tasks}
            currentUser={data.currentUser}
        />);

        fireEvent.change(screen.getByLabelText('Статус задачи'), { target: { value: 'DONE' } });
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        await waitFor(() => expect((screen.getByLabelText('Статус задачи') as HTMLSelectElement).value).toBe('TODO'));
        expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy();
    });
});

describe('kanban adjacent controls', () => {
    it('moves only to adjacent columns, keeps 44px targets and does not open the card', () => {
        const open = vi.fn();
        const move = vi.fn();
        render(<KanbanCard task={task('task-5', 'Соседний шаг', 'TODO', 'u1')} onClick={open} onStatusMove={move} />);
        const left = screen.getByRole('button', { name: 'Переместить «Соседний шаг» в Входящие' });
        const right = screen.getByRole('button', { name: 'Переместить «Соседний шаг» в В процессе' });
        expect(left.className).toContain('h-11');
        expect(left.className).toContain('w-11');
        fireEvent.pointerDown(left);
        fireEvent.click(left);
        fireEvent.click(right);
        expect(move.mock.calls.map(call => call[0])).toEqual(['INBOX', 'IN_PROGRESS']);
        expect(open).not.toHaveBeenCalled();
    });

    it('disables controls at both edges and preserves keyboard arrows', () => {
        const move = vi.fn();
        const { rerender } = render(<KanbanCard task={task('task-6', 'Первая', 'INBOX', 'u1')} onClick={() => undefined} onStatusMove={move} />);
        expect((screen.getByRole('button', { name: '«Первая» уже в первой колонке' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole('button', { name: /Открыть задачу «Первая»/ }), { key: 'ArrowRight' });
        expect(move).toHaveBeenLastCalledWith('TODO');

        rerender(<KanbanCard task={task('task-7', 'Последняя', 'DROPPED', 'u1')} onClick={() => undefined} onStatusMove={move} />);
        expect((screen.getByRole('button', { name: '«Последняя» уже в последней колонке' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole('button', { name: /Открыть задачу «Последняя»/ }), { key: 'ArrowLeft' });
        expect(move).toHaveBeenLastCalledWith('DONE');
    });

    it('hides move controls for routine instances', () => {
        render(<KanbanCard task={{ ...task('task-8', 'Рутина', 'TODO'), routineTemplateId: 'routine-1' }} onClick={() => undefined} />);
        expect(screen.queryByRole('button', { name: /Переместить/ })).toBeNull();
    });
});

const GuardProbe = ({ commands }: { commands: Record<string, () => Promise<void>> }) => {
    const guard = useTaskActionGuard();
    return <>
        {Object.keys(commands).map(id => <button key={id} type="button" onClick={() => void guard.run(id, commands[id])}>{id}</button>)}
    </>;
};

describe('task pending guard', () => {
    it('deduplicates one task while allowing another task to start independently', async () => {
        const resolvers: Record<string, () => void> = {};
        const first = vi.fn(() => new Promise<void>(resolve => { resolvers.first = resolve; }));
        const second = vi.fn(() => new Promise<void>(resolve => { resolvers.second = resolve; }));
        render(<GuardProbe commands={{ first, second }} />);
        fireEvent.click(screen.getByRole('button', { name: 'first' }));
        fireEvent.click(screen.getByRole('button', { name: 'first' }));
        fireEvent.click(screen.getByRole('button', { name: 'second' }));
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        await act(async () => {
            resolvers.first();
            resolvers.second();
        });
    });
});
