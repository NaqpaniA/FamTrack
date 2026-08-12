import type { RoutineEvent } from '../routines.model.js';

export interface RoutineCommandLogInput {
    operation: string;
    mutationId: string;
    duplicate: boolean;
    rebased: boolean;
    requestedUnits?: unknown;
    event?: RoutineEvent;
}

const positiveInteger = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
};

export const buildRoutineCommandLog = ({
    operation,
    mutationId,
    duplicate,
    rebased,
    requestedUnits,
    event
}: RoutineCommandLogInput) => ({
    level: 'info',
    event: 'routine_command_result',
    operation,
    mutationId,
    duplicate,
    rebased,
    units: positiveInteger(event?.units ?? requestedUnits),
    xpAwarded: duplicate ? 0 : positiveInteger(event?.xpAwarded)
});
