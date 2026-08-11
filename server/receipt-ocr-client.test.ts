import assert from 'node:assert/strict';
import test from 'node:test';
import type { PurchaseImportFile } from '../purchase-import.model.js';
import { ReceiptOcrClient, ReceiptOcrError } from './receipt-ocr-client.js';

const file: PurchaseImportFile = {
    page: 1,
    path: '/safe/receipt.png',
    mimeType: 'image/png',
    sizeBytes: 24,
    sha256: 'a'.repeat(64),
    width: 10,
    height: 10,
    createdAt: 1
};

test('OCR client assigns page numbers and accepts deterministic sidecar output', async () => {
    const client = new ReceiptOcrClient('http://ocr', 100, async () => new Response(JSON.stringify({
        qrText: 't=20260811T1435&s=10.00',
        blocks: [{ text: 'ИТОГО 10,00', confidence: 0.9, polygon: [[1, 2], [3, 4]] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }), async () => Buffer.from('png'));
    const result = await client.recognize([file]);
    assert.equal(result.qrText, 't=20260811T1435&s=10.00');
    assert.equal(result.blocks[0].page, 1);
    assert.equal(result.blocks[0].text, 'ИТОГО 10,00');
});

test('OCR timeout is retryable and corrupt-image rejection is final', async () => {
    const timeoutClient = new ReceiptOcrClient('http://ocr', 5, (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }), async () => Buffer.from('png'));
    await assert.rejects(timeoutClient.recognize([file]), (error: unknown) => (
        error instanceof ReceiptOcrError && error.code === 'OCR_TIMEOUT' && error.retryable
    ));

    const rejectedClient = new ReceiptOcrClient('http://ocr', 100, async () => new Response('', { status: 422 }), async () => Buffer.from('png'));
    await assert.rejects(rejectedClient.recognize([file]), (error: unknown) => (
        error instanceof ReceiptOcrError && error.code === 'OCR_IMAGE_REJECTED' && !error.retryable
    ));
});
