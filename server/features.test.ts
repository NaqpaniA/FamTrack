import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import { applyCapabilities, readFeatureCapabilities } from './features.js';

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
        wishlists: [{ id: 'hidden-list' }] as never,
        pantry: { products: [{ id: 'hidden-product' }], recentMovements: [], totalProducts: 1, lowStockCount: 0 } as never
    };
    const result = applyCapabilities(data, readFeatureCapabilities({} as NodeJS.ProcessEnv));
    assert.deepEqual(result.routines, []);
    assert.deepEqual(result.routineEvents, []);
    assert.deepEqual(result.wishlists, []);
    assert.equal(result.pantry, undefined);
});
