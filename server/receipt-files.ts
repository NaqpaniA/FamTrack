import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PurchaseImportFile } from '../purchase-import.model.js';
import { DomainError } from './domain.js';

export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;
export const MAX_RECEIPT_PIXELS = 40_000_000;

export interface ReceiptImageInfo {
    mimeType: PurchaseImportFile['mimeType'];
    width: number;
    height: number;
    sizeBytes: number;
    sha256: string;
}

export const inspectReceiptImage = (bytes: Buffer, declaredType?: string): ReceiptImageInfo => {
    if (bytes.length === 0) throw new DomainError('Receipt image is empty', 422);
    if (bytes.length > MAX_RECEIPT_BYTES) throw new DomainError('Receipt image exceeds 12 MiB', 413);
    const png = pngDimensions(bytes);
    const jpeg = png ? undefined : jpegDimensions(bytes);
    const dimensions = png || jpeg;
    if (!dimensions) throw new DomainError('Receipt image is corrupt or unsupported', 422);
    const mimeType: ReceiptImageInfo['mimeType'] = png ? 'image/png' : 'image/jpeg';
    if (declaredType && declaredType.split(';')[0].trim().toLowerCase() !== mimeType) {
        throw new DomainError('Receipt image type does not match its contents', 422);
    }
    if (dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width * dimensions.height > MAX_RECEIPT_PIXELS) {
        throw new DomainError('Receipt image exceeds 40 MP', 413);
    }
    return {
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')
    };
};

export const storeReceiptPage = async (input: {
    root: string;
    familyId: string;
    importId: string;
    page: number;
    bytes: Buffer;
    info: ReceiptImageInfo;
    createdAt?: number;
}) => {
    assertSafeSegment(input.familyId);
    assertSafeSegment(input.importId);
    if (!Number.isInteger(input.page) || input.page < 1 || input.page > 3) {
        throw new DomainError('Receipt page must be between 1 and 3', 422);
    }
    const root = path.resolve(input.root);
    const directory = path.resolve(root, input.familyId, input.importId);
    assertInsideRoot(root, directory);
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    const extension = input.info.mimeType === 'image/png' ? 'png' : 'jpg';
    const finalPath = path.join(directory, `${input.page}-${input.info.sha256}.${extension}`);
    const existed = fs.existsSync(finalPath);
    if (!existed) {
        const temporaryPath = path.join(directory, `.${input.page}-${randomUUID()}.tmp`);
        let handle: fs.promises.FileHandle | undefined;
        try {
            handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
            await handle.writeFile(input.bytes);
            await handle.sync();
            await handle.close();
            handle = undefined;
            await fs.promises.rename(temporaryPath, finalPath);
            const directoryHandle = await fs.promises.open(directory, 'r');
            try {
                await directoryHandle.sync();
            } finally {
                await directoryHandle.close();
            }
        } catch (error) {
            await handle?.close().catch(() => undefined);
            await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
            throw error;
        }
    }
    return {
        created: !existed,
        file: {
            page: input.page,
            path: finalPath,
            mimeType: input.info.mimeType,
            sizeBytes: input.info.sizeBytes,
            sha256: input.info.sha256,
            width: input.info.width,
            height: input.info.height,
            createdAt: input.createdAt ?? Date.now()
        } satisfies PurchaseImportFile
    };
};

export const removeReceiptFile = async (rootValue: string, filePath: string | undefined) => {
    if (!filePath) return;
    const root = path.resolve(rootValue);
    const target = path.resolve(filePath);
    assertInsideRoot(root, target);
    await fs.promises.rm(target, { force: true });
};

export const assertStoredReceiptPath = (rootValue: string, filePath: string) => {
    const root = path.resolve(rootValue);
    const target = path.resolve(filePath);
    assertInsideRoot(root, target);
    return target;
};

const pngDimensions = (bytes: Buffer) => {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return undefined;
    if (bytes.toString('ascii', 12, 16) !== 'IHDR') return undefined;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const jpegDimensions = (bytes: Buffer) => {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) return undefined;
        while (bytes[offset] === 0xff) offset += 1;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
        if (offset + 2 > bytes.length) return undefined;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) return undefined;
        if (isStartOfFrame(marker)) {
            if (length < 7) return undefined;
            return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
        }
        offset += length;
    }
    return undefined;
};

const isStartOfFrame = (marker: number) => (
    marker >= 0xc0 && marker <= 0xc3
    || marker >= 0xc5 && marker <= 0xc7
    || marker >= 0xc9 && marker <= 0xcb
    || marker >= 0xcd && marker <= 0xcf
);
const assertSafeSegment = (value: string) => {
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw new DomainError('Unsafe receipt storage identifier', 400);
};
const assertInsideRoot = (root: string, target: string) => {
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        throw new DomainError('Unsafe receipt storage path', 400);
    }
};
