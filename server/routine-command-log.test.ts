import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutineCommandLog } from './routine-command-log.js';

test('routine command logs contain only the privacy-safe outcome contract', () => {
    const log = buildRoutineCommandLog({
        operation: '/api/routines/complete',
        mutationId: 'mutation-routine-1234',
        duplicate: false,
        rebased: true,
        requestedUnits: 4,
        event: {
            id: 'event-1',
            routineId: 'routine-1',
            type: 'COMPLETED',
            actorId: 'member-1',
            units: 4,
            xpAwarded: 115,
            timestamp: 1,
            payload: { creditedUserId: 'member-2', privateTitle: 'Не логировать' }
        }
    });

    assert.deepEqual(log, {
        level: 'info',
        event: 'routine_command_result',
        operation: '/api/routines/complete',
        mutationId: 'mutation-routine-1234',
        duplicate: false,
        rebased: true,
        units: 4,
        xpAwarded: 115
    });
    assert.equal(JSON.stringify(log).includes('Не логировать'), false);
    assert.equal(JSON.stringify(log).includes('member-'), false);
});

test('duplicate routine command reports no additional XP', () => {
    const log = buildRoutineCommandLog({
        operation: '/api/routines/complete',
        mutationId: 'mutation-routine-duplicate',
        duplicate: true,
        rebased: false,
        requestedUnits: 2
    });

    assert.equal(log.units, 2);
    assert.equal(log.xpAwarded, 0);
});
