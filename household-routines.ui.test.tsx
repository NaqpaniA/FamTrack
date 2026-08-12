import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_DATA } from './data';
import { HouseholdDashboard } from './household.ui';
import type { RoutineTemplate } from './routines.model';
import type { AppData } from './types';

const routine: RoutineTemplate = {
    id: 'routine-dishes',
    title: 'Грязная посуда',
    kind: 'ACCUMULATOR',
    assignmentMode: 'FREE',
    assigneeIds: [],
    difficulty: 'EASY',
    priority: 'HIGH',
    visibility: 'FAMILY',
    startDate: '2026-08-12',
    timezone: 'UTC',
    paused: false,
    accumulatedUnits: 3,
    unitLabel: 'загрузки',
    streak: 4,
    createdById: 'u1',
    createdAt: 1,
    updatedAt: 1
};

const actions = {
    saveRoutine: vi.fn(),
    pauseRoutine: vi.fn(),
    completeRoutine: vi.fn(),
    recordRoutineUnit: vi.fn(),
    skipRoutine: vi.fn(),
    savePreferences: vi.fn(),
    saveWishlist: vi.fn(),
    saveWishlistItem: vi.fn(),
    deleteWishlistItem: vi.fn(),
    reserveWishlistItem: vi.fn()
};

describe('accumulator routine UI', () => {
    it('shows XP per unit and keeps accumulation/completion history distinct', () => {
        const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
        data.routines = [routine];
        data.routineEvents = [
            { id: 'recorded', routineId: routine.id, type: 'UNIT_RECORDED', actorId: data.currentUser.id, units: 1, timestamp: 1 },
            { id: 'completed', routineId: routine.id, type: 'COMPLETED', actorId: data.currentUser.id, units: 2, xpAwarded: 50, timestamp: 2 }
        ];
        data.dashboardPreferences = {
            userId: data.currentUser.id,
            scope: 'FAMILY',
            hiddenWidgets: ['day-pulse', 'house-health', 'leaderboard', 'projects', 'activity', 'notes', 'weather', 'wishlists'],
            widgetOrder: ['routines', 'history'],
            weatherOptIn: false
        };

        render(<HouseholdDashboard data={data} actions={actions} />);

        expect(screen.getByText(/3 загрузки · 25 XP\/ед\. · серия 4/)).toBeTruthy();
        expect(screen.getByText(/Выполнено \+2 · \+50 XP/)).toBeTruthy();
        expect(screen.getByText(/Накоплено \+1/)).toBeTruthy();
    });
});
