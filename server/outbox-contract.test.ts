import assert from 'node:assert/strict';
import test from 'node:test';
import { createOutboxRecord, MemoryOutboxPersistence } from '../outbox.js';

test('outbox keeps the exact command envelope until acknowledgement', async () => {
    const persistence = new MemoryOutboxPersistence();
    const envelope = {
        revision: 17,
        mutationId: 'mutation-offline-0001',
        task: { id: 'task-1', title: 'Купить молоко' }
    };
    await persistence.put(createOutboxRecord('/api/tasks/save', envelope, 1234));

    const afterAppRestart = await persistence.list();
    assert.equal(afterAppRestart.length, 1);
    assert.deepEqual(afterAppRestart[0].envelope, envelope);

    afterAppRestart[0].attempts += 1;
    await persistence.put(afterAppRestart[0]);
    assert.deepEqual((await persistence.get(envelope.mutationId))?.envelope, envelope);

    await persistence.remove(envelope.mutationId);
    assert.equal((await persistence.list()).length, 0);
});

test('binary receipt upload keeps exact bytes beside the command envelope', async () => {
    const persistence = new MemoryOutboxPersistence();
    const envelope = { revision: 18, mutationId: 'mutation-receipt-0001', sha256: 'a'.repeat(64) };
    const binary = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    await persistence.put(createOutboxRecord('/api/purchase-imports/import-1/files/1', envelope, 1235, binary, binary.type));

    const restored = await persistence.get(envelope.mutationId);
    assert.deepEqual(restored?.envelope, envelope);
    assert.equal(restored?.contentType, 'image/png');
    assert.deepEqual([...new Uint8Array(await restored!.binary!.arrayBuffer())], [1, 2, 3, 4]);
});
