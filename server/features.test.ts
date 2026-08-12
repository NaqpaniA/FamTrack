import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import { applyCapabilities, isRoutineCompletionAvailable, readFeatureCapabilities } from './features.js';

test('release capabilities are off by default and parse explicit truthy values', () => {
    assert.deepEqual(readFeatureCapabilities({} as NodeJS.ProcessEnv), {
        routines: false,
        pantry: false,
        receiptOcr: false,
        wishlists: false
    });
    assert.deepEqual(readFeatureCapabilities({ ROUTINES: 'true', PANTRY: '1', RECEIPT_OCR: 'yes' } as NodeJS.ProcessEnv), {
        routines: true,
        pantry: true,
        receiptOcr: true,
        wishlists: true
    });
});

test('disabled capabilities do not expose release collections', () => {
    const data = {
        ...INITIAL_DATA,
        routines: [{ id: 'hidden' }] as never,
        routineEvents: [{ id: 'hidden-event' }] as never,
        routineSummary: { dueToday: 1 } as never,
        routineSummaries: { PERSONAL: { dueToday: 1 }, FAMILY: { dueToday: 1 } } as never,
        wishlists: [{ id: 'hidden-list' }] as never,
        pantry: { products: [{ id: 'hidden-product' }], recentMovements: [], totalProducts: 1, lowStockCount: 0 } as never
    };
    const result = applyCapabilities(data, readFeatureCapabilities({} as NodeJS.ProcessEnv));
    assert.deepEqual(result.routines, []);
    assert.deepEqual(result.routineEvents, []);
    assert.equal(result.routineSummary, undefined);
    assert.equal(result.routineSummaries, undefined);
    assert.deepEqual(result.wishlists, []);
    assert.equal(result.pantry, undefined);
});

test('disabled routine UI still allows completing an existing open occurrence', () => {
    const capabilities = readFeatureCapabilities({} as NodeJS.ProcessEnv);
    const data = {
        ...INITIAL_DATA,
        tasks: [{ id: 'task-open', routineTemplateId: 'routine-existing', status: 'TODO' }] as never,
        routines: [{ id: 'routine-existing', openTaskId: 'task-open' }] as never
    };
    assert.equal(isRoutineCompletionAvailable(data, {
        routineId: 'routine-existing',
        taskId: 'task-open'
    }, capabilities), true);
    assert.equal(isRoutineCompletionAvailable(data, {
        routineId: 'routine-existing',
        taskId: 'other-task'
    }, capabilities), false);
    assert.equal(isRoutineCompletionAvailable({
        ...data,
        tasks: [{ id: 'task-open', routineTemplateId: 'routine-existing', status: 'DONE' }] as never
    }, {
        routineId: 'routine-existing',
        taskId: 'task-open'
    }, capabilities), false);
});
