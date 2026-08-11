import type { PantryProduct } from '../pantry.model.js';
import type { ReceiptOcrBlock } from '../purchase-import.model.js';
import type { ShoppingItem } from '../shopping.model.js';

export interface ParsedReceiptItem {
    title: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
    pantryProductId?: string;
    shoppingItemId?: string;
}

export interface ParsedReceipt {
    merchant?: string;
    purchasedAt?: string;
    totalAmount?: number;
    items: ParsedReceiptItem[];
}

const TOTAL_LABEL = /(?:^|\s)(?:итог|итого|к\s*оплате|total|сумма)(?:\s|:|$)/iu;
const NON_ITEM = /(?:итог|итого|к\s*оплате|total|наличн|безнал|карта|сдача|ндс|кассир|инн|чек|фн|фд|фп|спасибо)/iu;
const MONEY_AT_END = /(?:^|\s)(\d{1,9}(?:[\s.]\d{3})*[,.]\d{2})\s*(?:₽|руб\.?|р)?\s*$/iu;
const DATE = /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])(?:[ T](\d{1,2}):([0-5]\d)(?::([0-5]\d))?)?\b/u;
const RUSSIAN_DATE = /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})(?:\s+(\d{1,2}):([0-5]\d)(?::([0-5]\d))?)?\b/u;

export const parseReceipt = (
    blocks: ReceiptOcrBlock[],
    qrText: string | undefined,
    products: PantryProduct[],
    shoppingList: ShoppingItem[]
): ParsedReceipt => {
    const lines = [...blocks]
        .sort((left, right) => left.page - right.page || top(left) - top(right) || leftmost(left) - leftmost(right))
        .map(block => normalizeLine(block.text))
        .filter(Boolean);
    const fiscal = parseFiscalQr(qrText);
    const labelledTotals = lines
        .filter(line => TOTAL_LABEL.test(line))
        .map(moneyAtEnd)
        .filter((value): value is number => value !== undefined);
    const totalAmount = fiscal.totalAmount || labelledTotals.at(-1);
    const purchasedAt = fiscal.purchasedAt || lines.map(parseDate).find((value): value is string => !!value);
    const merchant = lines.find(line => (
        /[A-Za-zА-Яа-яЁё]{3}/u.test(line)
        && !NON_ITEM.test(line)
        && !parseDate(line)
        && moneyAtEnd(line) === undefined
    ));
    const items: ParsedReceiptItem[] = [];
    for (const line of lines) {
        const price = moneyAtEnd(line);
        if (price === undefined || TOTAL_LABEL.test(line) || NON_ITEM.test(line)) continue;
        const titlePart = normalizeTitle(line.replace(MONEY_AT_END, ''));
        if (!titlePart || titlePart.length < 2) continue;
        const quantityMatch = titlePart.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*[xх*]\s*(\d+(?:[,.]\d{2}))/iu);
        const quantity = quantityMatch ? parseDecimal(quantityMatch[1]) || 1 : 1;
        const unitPrice = quantityMatch ? Math.round((parseDecimal(quantityMatch[2]) || 0) * 100) : undefined;
        const title = normalizeTitle(quantityMatch ? titlePart.replace(quantityMatch[0], '') : titlePart);
        if (!title) continue;
        const normalized = catalogKey(title);
        const product = bestCatalogMatch(normalized, products.map(item => ({
            id: item.id,
            keys: [item.name, ...item.aliases].map(catalogKey)
        })));
        const shopping = bestCatalogMatch(normalized, shoppingList.map(item => ({ id: item.id, keys: [catalogKey(item.title)] })));
        items.push({
            title,
            quantity,
            unitPrice: unitPrice && unitPrice > 0 ? unitPrice : undefined,
            totalPrice: price,
            pantryProductId: product,
            shoppingItemId: shopping
        });
    }
    return { merchant, purchasedAt, totalAmount, items: deduplicateItems(items) };
};

export const parseFiscalQr = (value?: string) => {
    if (!value) return {};
    const params = new URLSearchParams(value.includes('?') ? value.slice(value.indexOf('?') + 1) : value);
    const total = parseDecimal(params.get('s') || '');
    const rawDate = params.get('t');
    let purchasedAt: string | undefined;
    if (rawDate && /^20\d{6}T\d{4,6}$/.test(rawDate)) {
        const seconds = rawDate.length === 15 ? rawDate.slice(9, 15) : `${rawDate.slice(9, 13)}00`;
        purchasedAt = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${seconds.slice(0, 2)}:${seconds.slice(2, 4)}:${seconds.slice(4, 6)}.000Z`;
    }
    return {
        totalAmount: total > 0 ? Math.round(total * 100) : undefined,
        purchasedAt
    };
};

const parseDate = (line: string) => {
    const iso = line.match(DATE);
    const russian = line.match(RUSSIAN_DATE);
    const match = iso || russian;
    if (!match) return undefined;
    const [year, month, day, hour = '00', minute = '00', second = '00'] = iso
        ? [match[1], match[2], match[3], match[4], match[5], match[6]]
        : [match[3], match[2], match[1], match[4], match[5], match[6]];
    const result = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}.000Z`);
    return Number.isNaN(result.getTime()) ? undefined : result.toISOString();
};
const moneyAtEnd = (line: string) => {
    const match = line.match(MONEY_AT_END);
    const amount = match ? parseDecimal(match[1]) : 0;
    return amount > 0 ? Math.round(amount * 100) : undefined;
};
const parseDecimal = (value: string) => Number(value.replace(/[\s.](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
const normalizeLine = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizeTitle = (value: string) => value.replace(/^\d+[.)]\s*/, '').replace(/[;:.,\-\s]+$/g, '').trim();
const catalogKey = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/giu, ' ').trim();
const bestCatalogMatch = (key: string, candidates: Array<{ id: string; keys: string[] }>) => candidates.find(candidate => candidate.keys.some(candidateKey => (
    candidateKey === key || (candidateKey.length >= 4 && (candidateKey.includes(key) || key.includes(candidateKey)))
)))?.id;
const deduplicateItems = (items: ParsedReceiptItem[]) => {
    const result: ParsedReceiptItem[] = [];
    for (const item of items) {
        const previous = result.find(candidate => catalogKey(candidate.title) === catalogKey(item.title) && candidate.unitPrice === item.unitPrice);
        if (previous) {
            previous.quantity += item.quantity;
            previous.totalPrice = (previous.totalPrice || 0) + (item.totalPrice || 0);
        } else result.push({ ...item });
    }
    return result;
};
const top = (block: ReceiptOcrBlock) => {
    const coordinates = (block.polygon || []).map(point => point[1]).filter(Number.isFinite);
    return coordinates.length > 0 ? Math.min(...coordinates) : 0;
};
const leftmost = (block: ReceiptOcrBlock) => {
    const coordinates = (block.polygon || []).map(point => point[0]).filter(Number.isFinite);
    return coordinates.length > 0 ? Math.min(...coordinates) : 0;
};
