import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DomainError } from './domain.js';
import { adjustPantry, hasValidGtinChecksum, normalizeBarcode } from './pantry.js';

const cloneData = () => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.pantry = { products: [], recentMovements: [], totalProducts: 0, lowStockCount: 0 };
    return data;
};

test('GTIN checksums accept EAN/UPC and reject corrupt identifiers', () => {
    assert.equal(hasValidGtinChecksum('4006381333931'), true);
    assert.equal(normalizeBarcode('4006 3813 3393 1'), '4006381333931');
    assert.equal(normalizeBarcode('4006381333932'), undefined);
    assert.equal(normalizeBarcode('123'), undefined);
});

test('repeated barcode adjusts one family product and appends immutable movements', () => {
    const data = cloneData();
    const actor = data.members[0];
    let id = 0;
    const idFactory = () => String(++id);
    const first = adjustPantry(data, {
        barcode: '4006381333931',
        name: 'Молоко',
        quantityDelta: 1,
        location: 'Холодильник'
    }, actor, () => 10, idFactory);
    const second = adjustPantry(first, {
        barcode: '4006381333931',
        quantityDelta: 2
    }, actor, () => 20, idFactory);
    assert.equal(second.pantry?.products.length, 1);
    assert.equal(second.pantry?.products[0].quantity, 3);
    assert.equal(second.pantry?.recentMovements.length, 2);
    assert.deepEqual(second.pantry?.recentMovements.map(movement => movement.quantityAfter), [3, 1]);
});

test('finished action never produces negative stock and cannot reward an empty product twice', () => {
    const data = cloneData();
    const actor = data.members[0];
    let id = 0;
    const idFactory = () => String(++id);
    const stocked = adjustPantry(data, { productId: 'rice', name: 'Рис', quantityDelta: 1.5 }, actor, () => 10, idFactory);
    const empty = adjustPantry(stocked, { productId: 'rice', finished: true }, actor, () => 20, idFactory);
    assert.equal(empty.pantry?.products[0].quantity, 0);
    assert.equal(empty.pantry?.recentMovements[0].quantityDelta, -1.5);
    assert.throws(
        () => adjustPantry(empty, { productId: 'rice', finished: true }, actor, () => 30, idFactory),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});
