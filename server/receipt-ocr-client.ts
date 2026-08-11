import fs from 'node:fs';
import path from 'node:path';
import type { PurchaseImportFile, ReceiptOcrBlock } from '../purchase-import.model.js';

type FetchLike = typeof fetch;
type ReadFile = (filePath: string) => Promise<Buffer>;

export class ReceiptOcrError extends Error {
    constructor(message: string, public code: string, public retryable: boolean) {
        super(message);
    }
}

export class ReceiptOcrClient {
    constructor(
        private readonly baseUrl = process.env.RECEIPT_OCR_URL || 'http://receipt-ocr:8090',
        private readonly timeoutMs = positiveInteger(process.env.RECEIPT_OCR_TIMEOUT_MS, 120_000),
        private readonly fetchImpl: FetchLike = fetch,
        private readonly readFile: ReadFile = fs.promises.readFile
    ) {}

    async recognize(files: PurchaseImportFile[]) {
        const blocks: ReceiptOcrBlock[] = [];
        let qrText: string | undefined;
        for (const file of [...files].sort((left, right) => left.page - right.page)) {
            if (!file.path) throw new ReceiptOcrError('Receipt file is unavailable', 'OCR_FILE_MISSING', false);
            const bytes = await this.readFile(file.path).catch(() => {
                throw new ReceiptOcrError('Receipt file is unavailable', 'OCR_FILE_MISSING', false);
            });
            const form = new FormData();
            form.append('file', new Blob([new Uint8Array(bytes)], { type: file.mimeType }), path.basename(file.path));
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            let response: Response;
            try {
                response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/v1/ocr`, {
                    method: 'POST',
                    body: form,
                    signal: controller.signal
                });
            } catch (error) {
                if (controller.signal.aborted) {
                    throw new ReceiptOcrError('Receipt OCR timed out', 'OCR_TIMEOUT', true);
                }
                throw new ReceiptOcrError('Receipt OCR is unavailable', 'OCR_UNAVAILABLE', true);
            } finally {
                clearTimeout(timeout);
            }
            if (!response.ok) {
                const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
                throw new ReceiptOcrError(
                    retryable ? 'Receipt OCR is temporarily unavailable' : 'Receipt image was rejected by OCR',
                    retryable ? 'OCR_UNAVAILABLE' : 'OCR_IMAGE_REJECTED',
                    retryable
                );
            }
            const payload = await response.json().catch(() => undefined) as {
                qrText?: unknown;
                blocks?: Array<{ text?: unknown; confidence?: unknown; polygon?: unknown }>;
            } | undefined;
            if (!payload || !Array.isArray(payload.blocks)) {
                throw new ReceiptOcrError('Receipt OCR returned an invalid response', 'OCR_INVALID_RESPONSE', true);
            }
            if (!qrText && typeof payload.qrText === 'string' && payload.qrText.trim()) qrText = payload.qrText.trim();
            for (const block of payload.blocks) {
                if (typeof block.text !== 'string' || !block.text.trim()) continue;
                blocks.push({
                    page: file.page,
                    text: block.text,
                    confidence: Number(block.confidence) || 0,
                    polygon: Array.isArray(block.polygon) ? block.polygon as number[][] : []
                });
            }
        }
        return { blocks, qrText };
    }
}

const positiveInteger = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
