import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DEFAULT_FAMILY_SETTINGS } from '../settings.model.js';
import { DEFAULT_FAMILY_ID, FamTrackDatabase } from './database.js';
import { DomainError } from './domain.js';
import {
    addPurchaseBarcode,
    applyPurchaseImportOcr,
    attachPurchaseImportFile,
    claimPurchaseImport,
    confirmPurchaseImport,
    createPurchaseImport,
    failPurchaseImport,
    purchaseImportOcrBlocksForActor,
    purchaseImportsForActor,
    queuePurchaseImport,
    savePurchaseImportItem
} from './purchase-imports.js';

const cloneData = (): AppData => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.family = {
        id: 'purchase-family',
        name: 'Purchase family',
        ownerUserId: data.members[0].id,
        revision: 1,
        createdAt: 1,
        settings: { ...DEFAULT_FAMILY_SETTINGS }
    };
    data.pantry = { products: [], recentMovements: [], totalProducts: 0, lowStockCount: 0 };
    data.purchaseImports = [];
    return data;
};
const ids = () => {
    let value = 0;
    return () => `generated-${++value}`;
};

test('atomic purchase confirm creates one expense, debits once, closes reviewed shopping matches and stocks pantry', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const initialBalance = data.accounts.find(account => account.id === 'ac1')!.balance;
    const created = createPurchaseImport(data, {
        id: 'import-receipt',
        source: 'RECEIPT',
        merchant: 'Супермаркет',
        accountId: 'ac1',
        totalAmount: 12_300,
        purchasedAt: '2026-08-11T10:00:00.000Z'
    }, actor, () => 10, idFactory);
    const scanned = addPurchaseBarcode(created, {
        importId: 'import-receipt',
        barcode: '4006381333931',
        name: 'Молоко',
        quantity: 2
    }, actor, () => 20, idFactory);
    const item = scanned.purchaseImports![0].items[0];
    const reviewed = savePurchaseImportItem(scanned, {
        ...item,
        importId: 'import-receipt',
        shoppingItemId: 's1',
        confirmed: true,
        includeInPantry: true
    }, actor, () => 30, idFactory);
    const confirmed = confirmPurchaseImport(reviewed, 'import-receipt', actor, () => 40, idFactory);

    assert.equal(confirmed.accounts.find(account => account.id === 'ac1')?.balance, initialBalance - 12_300);
    assert.equal(confirmed.transactions.filter(transaction => transaction.id === 'transaction-purchase-import-receipt').length, 1);
    assert.equal(confirmed.pantry?.products.find(product => product.name === 'Молоко')?.quantity, 2);
    assert.equal(confirmed.pantry?.recentMovements.filter(movement => movement.sourceId === 'import-receipt').length, 1);
    assert.ok(!confirmed.shoppingList.some(shoppingItem => shoppingItem.id === 's1'));
    assert.ok(confirmed.shoppingList.some(shoppingItem => shoppingItem.id === 's2'));
    assert.equal(confirmed.purchaseImports![0].status, 'CONFIRMED');
    assert.equal(confirmed.purchaseImports![0].confirmedResult?.transactionId, 'transaction-purchase-import-receipt');
    assert.equal(confirmed.events[0].type, 'PURCHASE_IMPORT_CONFIRMED');

    const repeated = confirmPurchaseImport(confirmed, 'import-receipt', actor, () => 50, idFactory);
    assert.equal(repeated, confirmed);
    assert.equal(repeated.accounts.find(account => account.id === 'ac1')?.balance, initialBalance - 12_300);
    assert.equal(repeated.transactions.filter(transaction => transaction.id === 'transaction-purchase-import-receipt').length, 1);
});

test('child drafts are stock-only and cannot be turned into account spending', () => {
    const data = cloneData();
    const child = data.members.find(member => member.role === 'CHILD')!;
    const idFactory = ids();
    const created = createPurchaseImport(data, {
        id: 'child-draft',
        source: 'BARCODE',
        stockOnly: false,
        accountId: 'ac1',
        totalAmount: 100
    }, child, () => 10, idFactory);
    assert.equal(created.purchaseImports![0].stockOnly, true);
    const scanned = addPurchaseBarcode(created, {
        importId: 'child-draft',
        barcode: '4006381333931',
        name: 'Йогурт'
    }, child, () => 20, idFactory);
    const confirmed = confirmPurchaseImport(scanned, 'child-draft', child, () => 30, idFactory);
    assert.equal(confirmed.transactions.length, data.transactions.length);
    assert.equal(confirmed.pantry?.products[0].name, 'Йогурт');

    const forged: AppData = {
        ...scanned,
        purchaseImports: scanned.purchaseImports!.map(job => ({ ...job, stockOnly: false }))
    };
    assert.throws(
        () => confirmPurchaseImport(forged, 'child-draft', child, () => 40, idFactory),
        (error: unknown) => error instanceof DomainError && error.status === 403
    );
});

test('duplicate receipt fingerprint is rejected before a second draft is created', () => {
    const data = cloneData();
    const actor = data.members[0];
    const first = createPurchaseImport(data, { source: 'RECEIPT', sourceReceiptHash: 'sha256-fixture' }, actor, () => 1, ids());
    assert.throws(
        () => createPurchaseImport(first, { source: 'RECEIPT', sourceReceiptHash: 'sha256-fixture' }, actor, () => 2, ids()),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});

test('receipt lifecycle persists files separately, requires review and hides internal OCR data', () => {
    const data = cloneData();
    const actor = data.members[0];
    const idFactory = ids();
    const created = createPurchaseImport(data, {
        id: 'ocr-import', source: 'RECEIPT', accountId: 'ac1'
    }, actor, () => 1, idFactory);
    const uploaded = attachPurchaseImportFile(created, 'ocr-import', {
        page: 1,
        path: '/data/imports/purchase-family/ocr-import/1-fixture.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
        width: 100,
        height: 200,
        createdAt: 2
    }, actor, () => 2);
    assert.equal(uploaded.purchaseImports![0].status, 'UPLOADED');
    const queued = queuePurchaseImport(uploaded, 'ocr-import', actor, () => 3);
    const processing = claimPurchaseImport(queued, 'ocr-import', () => 4);
    const reviewed = applyPurchaseImportOcr(processing, 'ocr-import', {
        blocks: [
            { page: 1, text: 'Магазин У Дома', confidence: 0.9, polygon: [[0, 0]] },
            { page: 1, text: 'Молоко 99,90', confidence: 0.9, polygon: [[0, 10]] },
            { page: 1, text: 'ИТОГО 99,90', confidence: 0.9, polygon: [[0, 20]] }
        ]
    }, () => 5, idFactory);
    assert.equal(reviewed.purchaseImports![0].status, 'REVIEW_REQUIRED');
    assert.equal(reviewed.purchaseImports![0].totalAmount, 9_990);
    assert.equal(reviewed.purchaseImports![0].items[0].confirmed, false);
    assert.equal(purchaseImportOcrBlocksForActor(reviewed, 'ocr-import', actor).length, 3);
    const publicJob = purchaseImportsForActor(reviewed, actor)[0];
    assert.equal(publicJob.files?.[0].path, undefined);
    assert.equal(publicJob.ocrBlocks, undefined);
});

test('OCR failures transition from retryable to final after three attempts', () => {
    const data = cloneData();
    const actor = data.members[0];
    let next = attachPurchaseImportFile(createPurchaseImport(data, {
        id: 'retry-import', source: 'RECEIPT'
    }, actor, () => 1, ids()), 'retry-import', {
        page: 1,
        path: '/data/imports/retry.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        sha256: 'b'.repeat(64),
        width: 10,
        height: 10,
        createdAt: 2
    }, actor, () => 2);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        next = queuePurchaseImport(next, 'retry-import', actor, () => attempt * 10);
        next = claimPurchaseImport(next, 'retry-import', () => attempt * 10 + 1);
        next = failPurchaseImport(next, 'retry-import', 'OCR_TIMEOUT', true, () => attempt * 10 + 2);
        assert.equal(next.purchaseImports![0].status, attempt < 3 ? 'FAILED_RETRYABLE' : 'FAILED_FINAL');
    }
    assert.equal(next.purchaseImports![0].retryCount, 3);
    assert.ok(next.purchaseImports![0].retentionUntil);
});

test('persisted confirm is idempotent even with a new mutation id and survives reopen', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-purchase-'));
    const dbPath = path.join(directory, 'famtrack.sqlite');
    const db = await FamTrackDatabase.open(dbPath);
    const initial = db.exportEnvelope(DEFAULT_FAMILY_ID);
    const actor = initial.data.currentUser;
    const familyId = initial.data.family!.id;
    const created = db.mutateCommand(familyId, initial.revision, {
        mutationId: 'mutation-purchase-create', actorId: actor.id, operation: '/api/purchase-imports', requestHash: 'create'
    }, data => createPurchaseImport(data, {
        id: 'persisted-import', source: 'BARCODE', stockOnly: false, accountId: 'ac1', totalAmount: 500
    }, actor, () => 10, ids()), actor);
    const scanned = db.mutateCommand(familyId, created.revision, {
        mutationId: 'mutation-purchase-barcode', actorId: actor.id, operation: '/api/purchase-imports/persisted-import/barcodes', requestHash: 'barcode'
    }, data => addPurchaseBarcode(data, {
        importId: 'persisted-import', barcode: '4006381333931', name: 'Молоко'
    }, actor, () => 20, ids()), actor);
    const confirmed = db.mutateCommand(familyId, scanned.revision, {
        mutationId: 'mutation-purchase-confirm', actorId: actor.id, operation: '/api/purchase-imports/persisted-import/confirm', requestHash: 'confirm'
    }, data => confirmPurchaseImport(data, 'persisted-import', actor, () => 30, ids()), actor);
    const repeated = db.mutateCommand(familyId, confirmed.revision, {
        mutationId: 'mutation-purchase-confirm-again', actorId: actor.id, operation: '/api/purchase-imports/persisted-import/confirm', requestHash: 'confirm-again'
    }, data => confirmPurchaseImport(data, 'persisted-import', actor, () => 40, ids()), actor);

    assert.equal(repeated.revision, confirmed.revision);
    assert.equal(repeated.data.transactions.filter(transaction => transaction.id === 'transaction-purchase-persisted-import').length, 1);
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const job = reopened.getAppData(DEFAULT_FAMILY_ID).purchaseImports?.find(candidate => candidate.id === 'persisted-import');
    assert.equal(job?.status, 'CONFIRMED');
    assert.equal(job?.items.length, 1);
    assert.equal(reopened.getAppData(DEFAULT_FAMILY_ID).transactions.filter(transaction => transaction.id === 'transaction-purchase-persisted-import').length, 1);
    reopened.close();
});

test('receipt file metadata survives database reopen without storing image bytes in SQLite', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'famtrack-receipt-file-'));
    const dbPath = path.join(directory, 'famtrack.sqlite');
    const db = await FamTrackDatabase.open(dbPath);
    const initial = db.exportEnvelope(DEFAULT_FAMILY_ID);
    const actor = initial.data.currentUser;
    const familyId = initial.data.family!.id;
    const created = db.mutateCommand(familyId, initial.revision, {
        mutationId: 'mutation-receipt-file-create', actorId: actor.id, operation: '/api/purchase-imports', requestHash: 'create-receipt'
    }, data => createPurchaseImport(data, { id: 'file-import', source: 'RECEIPT' }, actor, () => 1, ids()), actor);
    db.mutateCommand(familyId, created.revision, {
        mutationId: 'mutation-receipt-file-upload', actorId: actor.id, operation: '/api/purchase-imports/file-import/files/1', requestHash: 'upload-file'
    }, data => attachPurchaseImportFile(data, 'file-import', {
        page: 1,
        path: '/data/imports/fam-default/file-import/1-a.png',
        mimeType: 'image/png',
        sizeBytes: 24,
        sha256: 'a'.repeat(64),
        width: 10,
        height: 10,
        createdAt: 2
    }, actor, () => 2), actor);
    db.close();

    const reopened = await FamTrackDatabase.open(dbPath);
    const file = reopened.getAppData(DEFAULT_FAMILY_ID).purchaseImports?.find(job => job.id === 'file-import')?.files?.[0];
    assert.equal(file?.path, '/data/imports/fam-default/file-import/1-a.png');
    assert.equal(file?.width, 10);
    assert.equal(file?.height, 10);
    reopened.close();
});
