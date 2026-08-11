export class SerialJobQueue {
    private readonly queued: string[] = [];
    private readonly pending = new Set<string>();
    private running = false;

    constructor(private readonly handler: (key: string) => Promise<void>) {}

    enqueue(key: string) {
        if (this.pending.has(key)) return;
        this.pending.add(key);
        this.queued.push(key);
        void this.drain();
    }

    private async drain() {
        if (this.running) return;
        this.running = true;
        try {
            while (this.queued.length > 0) {
                const key = this.queued.shift()!;
                try {
                    await this.handler(key);
                } catch (error) {
                    console.error(JSON.stringify({
                        level: 'error',
                        event: 'receipt_queue_handler_failed',
                        error: error instanceof Error ? error.message : 'Unknown receipt queue error'
                    }));
                } finally {
                    this.pending.delete(key);
                }
            }
        } finally {
            this.running = false;
            if (this.queued.length > 0) void this.drain();
        }
    }
}
