export type CommandEnvelope = {
  revision: number;
  mutationId: string;
  [key: string]: unknown;
};

export type OutboxRecord = {
  mutationId: string;
  path: string;
  envelope: CommandEnvelope;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  needsReview?: boolean;
  /** Binary commands keep the exact bytes in IndexedDB until acknowledgement. */
  binary?: Blob;
  contentType?: string;
};

export interface OutboxPersistence {
  list(): Promise<OutboxRecord[]>;
  get(mutationId: string): Promise<OutboxRecord | undefined>;
  put(record: OutboxRecord): Promise<void>;
  remove(mutationId: string): Promise<void>;
}

const DB_NAME = 'famtrack-command-outbox';
const DB_VERSION = 1;
const STORE_NAME = 'commands';

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
});

export class IndexedDbOutboxPersistence implements OutboxPersistence {
  private databasePromise?: Promise<IDBDatabase>;

  private open() {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable'));
    }
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'mutationId' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open FamTrack outbox'));
      request.onblocked = () => reject(new Error('FamTrack outbox upgrade is blocked'));
    });
    return this.databasePromise;
  }

  async list() {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as OutboxRecord[];
    await done;
    return records.sort((left, right) => left.createdAt - right.createdAt || left.mutationId.localeCompare(right.mutationId));
  }

  async get(mutationId: string) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(mutationId)) as OutboxRecord | undefined;
    await done;
    return record;
  }

  async put(record: OutboxRecord) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(record);
    await done;
  }

  async remove(mutationId: string) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(mutationId);
    await done;
  }
}

export class MemoryOutboxPersistence implements OutboxPersistence {
  private readonly records = new Map<string, OutboxRecord>();

  async list() {
    return [...this.records.values()]
      .map(record => ({ ...record, envelope: { ...record.envelope }, binary: record.binary }))
      .sort((left, right) => left.createdAt - right.createdAt || left.mutationId.localeCompare(right.mutationId));
  }

  async get(mutationId: string) {
    const record = this.records.get(mutationId);
    return record ? { ...record, envelope: { ...record.envelope }, binary: record.binary } : undefined;
  }

  async put(record: OutboxRecord) {
    this.records.set(record.mutationId, { ...record, envelope: { ...record.envelope }, binary: record.binary });
  }

  async remove(mutationId: string) {
    this.records.delete(mutationId);
  }
}

export class ResilientOutboxPersistence implements OutboxPersistence {
  private readonly durable = new IndexedDbOutboxPersistence();
  private readonly fallback = new MemoryOutboxPersistence();
  private durableAvailable = true;

  private async use<T>(durableOperation: () => Promise<T>, fallbackOperation: () => Promise<T>) {
    if (!this.durableAvailable) return fallbackOperation();
    try {
      return await durableOperation();
    } catch {
      this.durableAvailable = false;
      return fallbackOperation();
    }
  }

  list() {
    return this.use(() => this.durable.list(), () => this.fallback.list());
  }

  get(mutationId: string) {
    return this.use(() => this.durable.get(mutationId), () => this.fallback.get(mutationId));
  }

  put(record: OutboxRecord) {
    return this.use(() => this.durable.put(record), () => this.fallback.put(record));
  }

  remove(mutationId: string) {
    return this.use(() => this.durable.remove(mutationId), () => this.fallback.remove(mutationId));
  }
}

export const createOutboxRecord = (
  path: string,
  envelope: CommandEnvelope,
  createdAt = Date.now(),
  binary?: Blob,
  contentType?: string
): OutboxRecord => ({
  mutationId: envelope.mutationId,
  path,
  envelope: { ...envelope },
  createdAt,
  attempts: 0,
  binary,
  contentType
});
