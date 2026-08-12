import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardScreen } from './dashboard.ui';
import { INITIAL_DATA } from './data';
import { TaskEditor, TasksScreen } from './tasks.ui';
import type { AppData, Task } from './types';

const emptyData = (): AppData => ({
    ...(JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData),
    tasks: [],
    epics: [],
    accounts: [],
    notes: [],
    events: [],
    capabilities: { routines: false, pantry: false, receiptOcr: false, wishlists: false }
});

const withOpenRoutineTask = () => {
    const data = emptyData();
    const task: Task = {
        id: 'routine-task-1',
        title: 'Полить растения',
        status: 'TODO',
        priority: 'LOW',
        difficulty: 'EASY',
        points: 15,
        createdById: data.currentUser.id,
        subtasks: [],
        createdAt: Date.now(),
        dueDate: new Date().toISOString().slice(0, 10),
        routineTemplateId: 'routine-1',
        routineOccurrenceKey: 'today'
    };
    data.tasks = [task];
    return { data, task };
};

const TaskEditorProbe = ({ source }: { source: 'dashboard' | 'tasks' }) => {
    const [open, setOpen] = useState(false);
    const data = emptyData();
    return <>
        {source === 'dashboard' ? <DashboardScreen
            data={data}
            onTaskClick={() => undefined}
            onTaskStatusChange={() => undefined}
            onNavigate={() => undefined}
            onAddTask={() => setOpen(true)}
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
        /> : <TasksScreen
            data={data}
            onTaskClick={() => undefined}
            onAddTask={() => setOpen(true)}
            onStatusChange={() => undefined}
            onRoutineComplete={() => undefined}
            onMoveTask={() => undefined}
            onAddEpic={() => undefined}
            onEditEpic={() => undefined}
            onEpicFilterChange={() => undefined}
        />}
        {open ? <div role="dialog" aria-label="Редактор новой задачи">Редактор задачи открыт</div> : null}
    </>;
};

describe('task creation entry points', () => {
    it('opens the editor from + Задача on the dashboard', () => {
        render(<TaskEditorProbe source="dashboard" />);
        fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
        expect(screen.getByRole('dialog', { name: 'Редактор новой задачи' })).toBeTruthy();
    });

    it('opens the editor from the labeled task-screen action', () => {
        render(<TaskEditorProbe source="tasks" />);
        const button = screen.getByRole('button', { name: 'Добавить задачу' });
        expect(button.textContent).toContain('Задача');
        fireEvent.click(button);
        expect(screen.getByRole('dialog', { name: 'Редактор новой задачи' })).toBeTruthy();
    });
});

describe('legacy routine completion entry points', () => {
    it('completes an open routine occurrence from the dashboard agenda', () => {
        const { data, task } = withOpenRoutineTask();
        const complete = vi.fn();
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
                completeRoutine: complete,
                recordRoutineUnit: () => undefined,
                skipRoutine: () => undefined,
                savePreferences: () => undefined,
                saveWishlist: () => undefined,
                saveWishlistItem: () => undefined,
                deleteWishlistItem: () => undefined,
                reserveWishlistItem: () => undefined
            }}
        />);

        fireEvent.click(screen.getByRole('button', { name: `Завершить рутину «${task.title}»` }));
        expect(complete).toHaveBeenCalledWith('routine-1', task.id);
    });

    it('completes an open routine occurrence from the task list', () => {
        const { data, task } = withOpenRoutineTask();
        const complete = vi.fn();
        render(<TasksScreen
            data={data}
            onTaskClick={() => undefined}
            onAddTask={() => undefined}
            onStatusChange={() => undefined}
            onRoutineComplete={complete}
            onMoveTask={() => undefined}
            onAddEpic={() => undefined}
            onEditEpic={() => undefined}
            onEpicFilterChange={() => undefined}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'Список задач' }));
        fireEvent.click(screen.getByRole('button', { name: `Завершить рутину «${task.title}»` }));
        expect(complete).toHaveBeenCalledWith('routine-1', task.id);
    });

    it('completes an open routine occurrence from the task modal editor', () => {
        const { data, task } = withOpenRoutineTask();
        const complete = vi.fn();
        render(<TaskEditor
            task={task}
            onSave={() => undefined}
            onDelete={() => undefined}
            onRoutineComplete={complete}
            members={data.members}
            epics={data.epics}
            availableTasks={data.tasks}
            currentUser={data.currentUser}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'Выполнить рутину' }));
        expect(complete).toHaveBeenCalledWith('routine-1', task.id);
    });
});
