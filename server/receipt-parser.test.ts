import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceiptOcrBlock } from '../purchase-import.model.js';
import { parseFiscalQr, parseReceipt } from './receipt-parser.js';

const blocks = (lines: string[]): ReceiptOcrBlock[] => lines.map((text, index) => ({
    page: 1,
    text,
    confidence: 0.95,
    polygon: [[0, index * 20], [100, index * 20], [100, index * 20 + 10], [0, index * 20 + 10]]
}));

test('deterministic receipt parser extracts merchant, date, total and catalog matches', () => {
    const parsed = parseReceipt(blocks([
        'Магазин У Дома',
        '11.08.2026 14:35',
        '1. Молоко 2 x 79,50 159,00',
        'Хлеб Бородинский 65,90',
        'К ОПЛАТЕ: 224,90'
    ]), undefined, [{
        id: 'milk', name: 'Молоко', aliases: ['Молоко 3,2'], identifiers: [], quantity: 0, unit: 'шт.', createdAt: 1, updatedAt: 1
    }], [{ id: 'bread', title: 'Хлеб Бородинский', category: 'FOOD', addedById: 'u1', isCompleted: false, createdAt: 1 }]);

    assert.equal(parsed.merchant, 'Магазин У Дома');
    assert.equal(parsed.purchasedAt, '2026-08-11T14:35:00.000Z');
    assert.equal(parsed.totalAmount, 22_490);
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].title, 'Молоко');
    assert.equal(parsed.items[0].quantity, 2);
    assert.equal(parsed.items[0].unitPrice, 7_950);
    assert.equal(parsed.items[0].pantryProductId, 'milk');
    assert.equal(parsed.items[1].shoppingItemId, 'bread');
});

test('fiscal QR provides total and timestamp without an external provider', () => {
    assert.deepEqual(parseFiscalQr('t=20260811T143500&s=123.45&fn=123&fd=4'), {
        totalAmount: 12_345,
        purchasedAt: '2026-08-11T14:35:00.000Z'
    });
});
