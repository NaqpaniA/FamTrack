import { createHash, randomUUID } from 'node:crypto';
import type { AppData } from '../types.js';
import type { User } from '../family.model.js';
import type {
    PurchaseImportFile,
    PurchaseImportItem,
    PurchaseImportJob,
    ReceiptOcrBlock
} from '../purchase-import.model.js';
import { DomainError, saveFinancialTransaction } from './domain.js';
import { adjustPantry, normalizeBarcode } from './pantry.js';
import { parseReceipt } from './receipt-parser.js';

type Clock = () => number;
type IdFactory = () => string;

const EDITABLE_STATUSES = new Set<PurchaseImportJob['status']>([
    'DRAFT', 'UPLOADED', 'REVIEW_REQUIRED', 'READY_TO_CONFIRM', 'FAILED_RETRYABLE'
]);
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;
const MAX_RECEIPT_PAGES = 3;
const MAX_OCR_RETRIES = 3;

export const createPurchaseImport = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const input = objectValue(raw);
    const source = input.source === 'RECEIPT' ? 'RECEIPT' : 'BARCODE';
    const sourceReceiptHash = optionalString(input.sourceReceiptHash, 128);
    if (sourceReceiptHash && (data.purchaseImports || []).some(job => (
        job.sourceReceiptHash === sourceReceiptHash && !['FAILED_FINAL', 'CANCELLED'].includes(job.status)
    ))) {
        throw new DomainError('This receipt is already imported', 409);
    }
    const stockOnly = actor.role === 'CHILD' ? true : input.stockOnly === true;
    const now = clock();
    const job: PurchaseImportJob = {
        id: stringValue(input.id, `purchase-import-${idFactory()}`, 120),
        familyId: data.family?.id || actor.familyId || '',
        actorId: actor.id,
        source,
        status: 'DRAFT',
        stockOnly,
        accountId: memberAccountId(input.accountId, data),
        categoryId: stringValue(input.categoryId, 'food', 80),
        merchant: optionalString(input.merchant, 240),
        purchasedAt: normalizedTimestamp(input.purchasedAt),
        totalAmount: positiveInteger(input.totalAmount),
        pageCount: 0,
        retryCount: 0,
        sourceReceiptHash,
        createdAt: now,
        updatedAt: now,
        items: []
    };
    return { ...data, purchaseImports: [job, ...(data.purchaseImports || [])] };
};

export const addPurchaseBarcode = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const input = objectValue(raw);
    const job = editableJob(data, input.importId, actor);
    const barcode = normalizeBarcode(input.barcode);
    if (!barcode) throw new DomainError('A valid EAN or UPC barcode is required', 422);
    const product = data.pantry?.products.find(candidate => candidate.identifiers.some(identifier => identifier.value === barcode));
    const title = stringValue(input.title || input.name, product?.name || '', 240);
    if (!title) throw new DomainError('Unknown products require a name once', 422);
    const quantity = boundedNumber(input.quantity, 1, 0.001, 100_000);
    const existing = job.items.find(item => item.barcode === barcode);
    const item: PurchaseImportItem = existing ? {
        ...existing,
        title,
        quantity: roundQuantity(existing.quantity + quantity),
        pantryProductId: existing.pantryProductId || product?.id,
        confirmed: true,
        includeInPantry: true
    } : {
        id: `purchase-item-${idFactory()}`,
        importId: job.id,
        title,
        quantity,
        barcode,
        pantryProductId: product?.id,
        confirmed: true,
        includeInPantry: true,
        unit: optionalString(input.unit, 30) || product?.unit,
        location: optionalString(input.location, 80) || product?.location,
        unitPrice: positiveInteger(input.unitPrice),
        totalPrice: positiveInteger(input.totalPrice)
    };
    return replaceJob(data, {
        ...job,
        status: readyStatus({ ...job, items: existing ? job.items.map(candidate => candidate.id === item.id ? item : candidate) : [...job.items, item] }),
        updatedAt: clock(),
        items: existing ? job.items.map(candidate => candidate.id === item.id ? item : candidate) : [...job.items, item]
    });
};

export const savePurchaseImportItem = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const input = objectValue(raw);
    const job = editableJob(data, input.importId, actor);
    const id = stringValue(input.id, `purchase-item-${idFactory()}`, 120);
    const previous = job.items.find(item => item.id === id);
    const item: PurchaseImportItem = {
        id,
        importId: job.id,
        title: stringValue(input.title, previous?.title || '', 240),
        quantity: boundedNumber(input.quantity, previous?.quantity || 1, 0.001, 100_000),
        unitPrice: positiveInteger(input.unitPrice) ?? previous?.unitPrice,
        totalPrice: positiveInteger(input.totalPrice) ?? previous?.totalPrice,
        barcode: normalizeBarcode(input.barcode) || previous?.barcode,
        pantryProductId: optionalString(input.pantryProductId, 120) || previous?.pantryProductId,
        shoppingItemId: optionalString(input.shoppingItemId, 120) || previous?.shoppingItemId,
        confirmed: typeof input.confirmed === 'boolean' ? input.confirmed : previous?.confirmed ?? true,
        includeInPantry: typeof input.includeInPantry === 'boolean' ? input.includeInPantry : previous?.includeInPantry ?? true,
        unit: optionalString(input.unit, 30) || previous?.unit,
        location: optionalString(input.location, 80) || previous?.location
    };
    if (!item.title) throw new DomainError('Purchase item title is required', 422);
    const items = previous ? job.items.map(candidate => candidate.id === id ? item : candidate) : [...job.items, item];
    const accountId = input.accountId === undefined ? job.accountId : memberAccountId(input.accountId, data);
    const nextJob: PurchaseImportJob = {
        ...job,
        accountId,
        categoryId: stringValue(input.categoryId, job.categoryId, 80),
        merchant: optionalString(input.merchant, 240) || job.merchant,
        purchasedAt: normalizedTimestamp(input.purchasedAt) || job.purchasedAt,
        totalAmount: positiveInteger(input.jobTotalAmount) ?? job.totalAmount,
        stockOnly: actor.role === 'CHILD' ? true : typeof input.stockOnly === 'boolean' ? input.stockOnly : job.stockOnly,
        items,
        updatedAt: clock()
    };
    nextJob.status = readyStatus(nextJob);
    return replaceJob(data, nextJob);
};

export const updatePurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now
): AppData => {
    const input = objectValue(raw);
    const job = editableJob(data, importIdValue, actor);
    const next: PurchaseImportJob = {
        ...job,
        stockOnly: actor.role === 'CHILD' ? true : typeof input.stockOnly === 'boolean' ? input.stockOnly : job.stockOnly,
        accountId: input.accountId === undefined ? job.accountId : memberAccountId(input.accountId, data),
        categoryId: stringValue(input.categoryId, job.categoryId, 80),
        merchant: input.merchant === undefined ? job.merchant : optionalString(input.merchant, 240),
        purchasedAt: input.purchasedAt === undefined ? job.purchasedAt : normalizedTimestamp(input.purchasedAt),
        totalAmount: input.totalAmount === undefined ? job.totalAmount : positiveInteger(input.totalAmount),
        updatedAt: clock()
    };
    next.status = readyStatus(next);
    return replaceJob(data, next);
};

export const attachPurchaseImportFile = (
    data: AppData,
    importIdValue: unknown,
    file: PurchaseImportFile,
    actor: User,
    clock: Clock = Date.now
): AppData => {
    const job = editableJob(data, importIdValue, actor);
    if (job.source !== 'RECEIPT') throw new DomainError('Files can only be attached to a receipt import', 409);
    if (!Number.isInteger(file.page) || file.page < 1 || file.page > MAX_RECEIPT_PAGES) {
        throw new DomainError(`A receipt supports pages 1–${MAX_RECEIPT_PAGES}`, 422);
    }
    const previous = (job.files || []).find(candidate => candidate.page === file.page);
    if (previous?.sha256 === file.sha256
        && previous.sizeBytes === file.sizeBytes
        && previous.width === file.width
        && previous.height === file.height
        && previous.mimeType === file.mimeType) {
        return data;
    }
    const files = [...(job.files || []).filter(candidate => candidate.page !== file.page), file]
        .sort((left, right) => left.page - right.page);
    const totalBytes = files.reduce((total, candidate) => total + candidate.sizeBytes, 0);
    if (totalBytes > MAX_RECEIPT_BYTES) throw new DomainError('Receipt pages exceed 12 MiB in total', 413);
    return replaceJob(data, {
        ...job,
        status: 'UPLOADED',
        pageCount: files.length,
        files,
        items: [],
        ocrBlocks: undefined,
        qrText: undefined,
        sourceReceiptHash: undefined,
        errorCode: undefined,
        processingStartedAt: undefined,
        updatedAt: clock()
    });
};

export const queuePurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    actor: User,
    clock: Clock = Date.now
): AppData => {
    const job = editableJob(data, importIdValue, actor);
    if (job.source !== 'RECEIPT') throw new DomainError('Only receipt imports use OCR processing', 409);
    if (!(job.files || []).length) throw new DomainError('Upload at least one receipt page before processing', 422);
    if (!['UPLOADED', 'FAILED_RETRYABLE', 'REVIEW_REQUIRED'].includes(job.status)) {
        throw new DomainError('Receipt cannot be queued in its current state', 409);
    }
    return replaceJob(data, {
        ...job,
        status: 'QUEUED',
        errorCode: undefined,
        processingStartedAt: undefined,
        updatedAt: clock()
    });
};

export const claimPurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    clock: Clock = Date.now
): AppData => {
    const job = findJob(data, importIdValue);
    if (job.status !== 'QUEUED') return data;
    const now = clock();
    return replaceJob(data, {
        ...job,
        status: 'PROCESSING',
        processingStartedAt: now,
        updatedAt: now
    });
};

export const recoverInterruptedPurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    clock: Clock = Date.now
): AppData => {
    const job = findJob(data, importIdValue);
    if (job.status !== 'PROCESSING') return data;
    return replaceJob(data, {
        ...job,
        status: 'QUEUED',
        errorCode: 'PROCESS_INTERRUPTED',
        processingStartedAt: undefined,
        updatedAt: clock()
    });
};

export const applyPurchaseImportOcr = (
    data: AppData,
    importIdValue: unknown,
    result: { blocks: ReceiptOcrBlock[]; qrText?: string },
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const job = findJob(data, importIdValue);
    if (job.status !== 'PROCESSING') return data;
    const blocks = normalizeOcrBlocks(result.blocks);
    const qrText = optionalString(result.qrText, 2_000);
    const sourceReceiptHash = receiptFingerprint(job.files || [], qrText);
    const duplicate = (data.purchaseImports || []).find(candidate => (
        candidate.id !== job.id
        && candidate.sourceReceiptHash === sourceReceiptHash
        && !['FAILED_FINAL', 'CANCELLED'].includes(candidate.status)
    ));
    if (duplicate) throw new DomainError('This receipt is already imported', 409);
    const parsed = parseReceipt(blocks, qrText, data.pantry?.products || [], data.shoppingList);
    const items: PurchaseImportItem[] = parsed.items.map(item => ({
        id: `purchase-item-${idFactory()}`,
        importId: job.id,
        title: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        pantryProductId: item.pantryProductId,
        shoppingItemId: item.shoppingItemId,
        confirmed: false,
        includeInPantry: true,
        unit: data.pantry?.products.find(product => product.id === item.pantryProductId)?.unit || 'шт.',
        location: data.pantry?.products.find(product => product.id === item.pantryProductId)?.location
    }));
    const now = clock();
    return replaceJob(data, {
        ...job,
        status: 'REVIEW_REQUIRED',
        merchant: parsed.merchant || job.merchant,
        purchasedAt: parsed.purchasedAt || job.purchasedAt,
        totalAmount: parsed.totalAmount || job.totalAmount,
        items,
        ocrBlocks: blocks,
        qrText,
        sourceReceiptHash,
        errorCode: undefined,
        processingStartedAt: undefined,
        updatedAt: now
    });
};

export const failPurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    errorCodeValue: unknown,
    retryable: boolean,
    clock: Clock = Date.now
): AppData => {
    const job = findJob(data, importIdValue);
    if (!['QUEUED', 'PROCESSING'].includes(job.status)) return data;
    const retryCount = job.retryCount + 1;
    const now = clock();
    const final = !retryable || retryCount >= MAX_OCR_RETRIES;
    return replaceJob(data, {
        ...job,
        status: final ? 'FAILED_FINAL' : 'FAILED_RETRYABLE',
        retryCount,
        errorCode: stringValue(errorCodeValue, 'OCR_FAILED', 80),
        processingStartedAt: undefined,
        retentionUntil: final ? now + 168 * 60 * 60 * 1000 : undefined,
        updatedAt: now
    });
};

export const cancelPurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    actor: User,
    clock: Clock = Date.now
): AppData => {
    const job = ownedJob(data, importIdValue, actor);
    if (job.status === 'CONFIRMED') throw new DomainError('A confirmed purchase cannot be cancelled', 409);
    if (job.status === 'CANCELLED') return data;
    const now = clock();
    return replaceJob(data, {
        ...job,
        status: 'CANCELLED',
        processingStartedAt: undefined,
        retentionUntil: now + 168 * 60 * 60 * 1000,
        updatedAt: now
    });
};

export const expirePurchaseImportFiles = (
    data: AppData,
    importIdValue: unknown,
    clock: Clock = Date.now
): AppData => {
    const job = findJob(data, importIdValue);
    if (!job.retentionUntil || job.retentionUntil > clock() || !(job.files || []).length) return data;
    return replaceJob(data, { ...job, files: [] });
};

export const confirmPurchaseImport = (
    data: AppData,
    importIdValue: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = stringValue(importIdValue, '', 120);
    const job = (data.purchaseImports || []).find(candidate => candidate.id === id);
    if (!job) throw new DomainError('Purchase import not found', 404);
    if (job.status === 'CONFIRMED') return data;
    if (!EDITABLE_STATUSES.has(job.status)) throw new DomainError('Purchase import cannot be confirmed in its current state', 409);
    if (job.actorId !== actor.id && actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
        throw new DomainError('Purchase import belongs to another family member', 403);
    }
    const selectedItems = job.items.filter(item => item.confirmed);
    if (selectedItems.length === 0) throw new DomainError('At least one reviewed item is required', 422);
    if (!job.stockOnly && actor.role === 'CHILD') {
        throw new DomainError('A parent must confirm account spending', 403);
    }

    const now = clock();
    const transactionId = job.stockOnly ? undefined : job.resultTransactionId || `transaction-purchase-${job.id}`;
    let next = data;
    if (!job.stockOnly) {
        if (!job.accountId || !job.totalAmount) throw new DomainError('Account and receipt total are required for an expense', 422);
        next = saveFinancialTransaction(next, {
            id: transactionId,
            amount: job.totalAmount,
            type: 'EXPENSE',
            categoryId: job.categoryId || 'food',
            accountId: job.accountId,
            title: job.merchant || 'Покупка по чеку',
            date: job.purchasedAt || new Date(now).toISOString()
        }, actor, () => now, idFactory);
    }

    const pantryMovementIds: string[] = [];
    for (const item of selectedItems.filter(candidate => candidate.includeInPantry)) {
        next = adjustPantry(next, {
            productId: item.pantryProductId,
            name: item.title,
            barcode: item.barcode,
            quantityDelta: item.quantity,
            type: 'PURCHASE',
            unit: item.unit,
            location: item.location,
            sourceId: job.id,
            note: job.merchant
        }, actor, () => now, idFactory);
        const movementId = next.pantry?.recentMovements[0]?.id;
        if (movementId) pantryMovementIds.push(movementId);
    }
    const shoppingIds = new Set(selectedItems.map(item => item.shoppingItemId).filter((value): value is string => !!value));
    const closedShoppingItemIds = next.shoppingList.filter(item => shoppingIds.has(item.id)).map(item => item.id);
    next = { ...next, shoppingList: next.shoppingList.filter(item => !shoppingIds.has(item.id)) };

    const confirmedJob: PurchaseImportJob = {
        ...job,
        status: 'CONFIRMED',
        resultTransactionId: transactionId,
        confirmedAt: now,
        retentionUntil: now + 24 * 60 * 60 * 1000,
        updatedAt: now,
        confirmedResult: { transactionId, pantryMovementIds, closedShoppingItemIds }
    };
    next = replaceJob(next, confirmedJob);
    return {
        ...next,
        events: [{
            id: `event-${idFactory()}`,
            type: 'PURCHASE_IMPORT_CONFIRMED',
            actorId: actor.id,
            payload: {
                importId: job.id,
                merchant: job.merchant,
                totalAmount: job.totalAmount,
                totalStr: job.totalAmount == null ? undefined : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(job.totalAmount / 100),
                pantryCount: pantryMovementIds.length,
                shoppingCount: closedShoppingItemIds.length
            },
            timestamp: now
        }, ...(next.events || [])]
    };
};

export const purchaseImportsForActor = (data: AppData, actor: User) => (data.purchaseImports || [])
    .filter(job => canAccessJob(job, actor))
    .map(publicPurchaseImport);

export const purchaseImportForActor = (data: AppData, importIdValue: unknown, actor: User) => (
    publicPurchaseImport(ownedJob(data, importIdValue, actor))
);

export const purchaseImportFileForActor = (data: AppData, importIdValue: unknown, page: number, actor: User) => {
    const job = ownedJob(data, importIdValue, actor);
    const file = (job.files || []).find(candidate => candidate.page === page);
    if (!file?.path) throw new DomainError('Receipt page not found', 404);
    return file;
};

export const purchaseImportOcrBlocksForActor = (data: AppData, importIdValue: unknown, actor: User) => {
    const job = ownedJob(data, importIdValue, actor);
    return job.ocrBlocks || [];
};

const readyStatus = (job: PurchaseImportJob): PurchaseImportJob['status'] => {
    const reviewed = job.items.some(item => item.confirmed);
    const financeReady = job.stockOnly || (!!job.accountId && !!job.totalAmount);
    return reviewed && financeReady ? 'READY_TO_CONFIRM' : 'REVIEW_REQUIRED';
};
const editableJob = (data: AppData, idValue: unknown, actor: User) => {
    const job = ownedJob(data, idValue, actor);
    if (!EDITABLE_STATUSES.has(job.status)) throw new DomainError('Purchase import is not editable', 409);
    return job;
};
const findJob = (data: AppData, idValue: unknown) => {
    const id = stringValue(idValue, '', 120);
    const job = (data.purchaseImports || []).find(candidate => candidate.id === id);
    if (!job) throw new DomainError('Purchase import not found', 404);
    return job;
};
const canAccessJob = (job: PurchaseImportJob, actor: User) => actor.role === 'OWNER' || actor.role === 'ADMIN' || job.actorId === actor.id;
const ownedJob = (data: AppData, idValue: unknown, actor: User) => {
    const job = findJob(data, idValue);
    if (!canAccessJob(job, actor)) throw new DomainError('Purchase import belongs to another family member', 403);
    return job;
};
const publicPurchaseImport = (job: PurchaseImportJob): PurchaseImportJob => ({
    ...job,
    files: (job.files || []).map(({ path: _path, ...file }) => file),
    ocrBlocks: undefined,
    qrText: undefined,
    sourceReceiptHash: undefined
});
const normalizeOcrBlocks = (blocks: ReceiptOcrBlock[]) => (Array.isArray(blocks) ? blocks : [])
    .filter(block => block && typeof block.text === 'string' && block.text.trim())
    .slice(0, 5_000)
    .map(block => ({
        page: Math.min(MAX_RECEIPT_PAGES, Math.max(1, Math.trunc(Number(block.page) || 1))),
        text: block.text.trim().slice(0, 2_000),
        confidence: Math.min(1, Math.max(0, Number(block.confidence) || 0)),
        polygon: Array.isArray(block.polygon)
            ? block.polygon.slice(0, 16).map(point => Array.isArray(point)
                ? point.slice(0, 2).map(coordinate => Number.isFinite(Number(coordinate)) ? Number(coordinate) : 0)
                : [0, 0])
            : []
    }));
const receiptFingerprint = (files: PurchaseImportFile[], qrText?: string) => createHash('sha256')
    .update(qrText ? `qr:${qrText}` : `files:${[...files].sort((left, right) => left.page - right.page).map(file => file.sha256).join(':')}`)
    .digest('hex');
const replaceJob = (data: AppData, job: PurchaseImportJob): AppData => ({
    ...data,
    purchaseImports: (data.purchaseImports || []).map(candidate => candidate.id === job.id ? job : candidate)
});
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown, fallback: string, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
const optionalString = (value: unknown, max: number) => stringValue(value, '', max) || undefined;
const positiveInteger = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.min(100_000_000_000, Math.trunc(numeric)) : undefined;
};
const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};
const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;
const memberAccountId = (value: unknown, data: AppData) => typeof value === 'string' && data.accounts.some(account => account.id === value) ? value : undefined;
const normalizedTimestamp = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};
