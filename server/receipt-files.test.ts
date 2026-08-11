import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectReceiptImage } from './receipt-files.js';

const png = (width: number, height: number) => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
    bytes.write('IHDR', 12, 'ascii');
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
};

test('receipt images are identified from bytes and constrained to 40 MP', () => {
    const image = inspectReceiptImage(png(1200, 2400), 'image/png');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(image.width, 1200);
    assert.equal(image.height, 2400);
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => inspectReceiptImage(png(8000, 6000), 'image/png'), /40 MP/);
});

test('corrupt receipt images and misleading content types are rejected', () => {
    assert.throws(() => inspectReceiptImage(Buffer.from('not an image'), 'image/png'), /corrupt or unsupported/);
    assert.throws(() => inspectReceiptImage(png(10, 10), 'image/jpeg'), /does not match/);
});
