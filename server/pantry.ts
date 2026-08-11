import { randomUUID } from 'node:crypto';
import type { AppData } from '../types.js';
import type { User } from '../family.model.js';
import type { PantryIdentifier, PantryMovement, PantryMovementType, PantryProduct } from '../pantry.model.js';
import { DomainError } from './domain.js';
import { hasValidGtinChecksum, normalizeBarcode } from '../barcode.js';

type Clock = () => number;
type IdFactory = () => string;

export { hasValidGtinChecksum, normalizeBarcode } from '../barcode.js';

export const adjustPantry = (
    data: AppData,
    input: {
        productId?: unknown;
        quantityDelta?: unknown;
        type?: unknown;
        name?: unknown;
        barcode?: unknown;
        unit?: unknown;
        location?: unknown;
        note?: unknown;
        sourceId?: unknown;
        finished?: unknown;
    },
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const pantry = data.pantry || { products: [], recentMovements: [], totalProducts: 0, lowStockCount: 0 };
    const barcode = normalizeBarcode(input.barcode);
    const requestedId = stringValue(input.productId, '', 120);
    let product = pantry.products.find(item => item.id === requestedId);
    if (!product && barcode) {
        product = pantry.products.find(item => item.identifiers.some(identifier => identifier.value === barcode));
    }
    const now = clock();
    if (!product) {
        const name = stringValue(input.name, '', 180);
        if (!name) throw new DomainError('Unknown products require a name', 422);
        const identifiers: PantryIdentifier[] = barcode ? [{ kind: barcode.length === 8 ? 'EAN_8' : barcode.length === 12 ? 'UPC_A' : 'EAN_13', value: barcode }] : [];
        product = {
            id: requestedId || `pantry-product-${idFactory()}`,
            name,
            aliases: [],
            identifiers,
            quantity: 0,
            unit: stringValue(input.unit, 'шт.', 30),
            location: optionalString(input.location, 80),
            createdAt: now,
            updatedAt: now
        };
    }
    if (input.finished === true && product.quantity <= 0) {
        throw new DomainError('Stock is already empty', 409);
    }
    const rawDelta = input.finished === true ? -product.quantity : Number(input.quantityDelta);
    if (!Number.isFinite(rawDelta) || rawDelta === 0) throw new DomainError('A non-zero stock adjustment is required');
    const type: PantryMovementType = input.type === 'PURCHASE'
        || input.type === 'CONSUME'
        || input.type === 'DISCARD'
        || input.type === 'CORRECTION'
        || input.type === 'ROLLBACK'
        ? input.type
        : rawDelta > 0 ? 'PURCHASE' : 'CONSUME';
    const quantityAfter = Math.max(0, roundQuantity(product.quantity + rawDelta));
    const appliedDelta = roundQuantity(quantityAfter - product.quantity);
    if (appliedDelta === 0) throw new DomainError('Stock is already empty', 409);
    const nextProduct: PantryProduct = {
        ...product,
        name: stringValue(input.name, product.name, 180),
        unit: stringValue(input.unit, product.unit, 30),
        location: optionalString(input.location, 80) || product.location,
        quantity: quantityAfter,
        updatedAt: now
    };
    const movement: PantryMovement = {
        id: `pantry-movement-${idFactory()}`,
        productId: nextProduct.id,
        type,
        quantityDelta: appliedDelta,
        quantityAfter,
        actorId: actor.id,
        sourceId: optionalString(input.sourceId, 120),
        note: optionalString(input.note, 500),
        createdAt: now
    };
    const products = pantry.products.some(item => item.id === nextProduct.id)
        ? pantry.products.map(item => item.id === nextProduct.id ? nextProduct : item)
        : [...pantry.products, nextProduct];
    return {
        ...data,
        pantry: {
            products,
            recentMovements: [movement, ...pantry.recentMovements].slice(0, 50),
            totalProducts: products.length,
            lowStockCount: products.filter(item => item.quantity <= (item.lowStockThreshold ?? 0)).length
        }
    };
};

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;
const stringValue = (value: unknown, fallback: string, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
const optionalString = (value: unknown, max: number) => stringValue(value, '', max) || undefined;
