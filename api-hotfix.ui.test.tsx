import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerAdapter } from './api';
import { INITIAL_DATA } from './data';
import { MemoryOutboxPersistence } from './outbox';
import type { AppData } from './types';

const cloneData = () => JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('server projection cache', () => {
    it('keeps fresh mutation XP when the following load is 304', async () => {
        const stale = cloneData();
        const fresh = cloneData();
        const userId = stale.currentUser.id;
        const nextXp = stale.currentUser.xp + 70;
        fresh.members = fresh.members.map(member => member.id === userId
            ? { ...member, xp: nextXp }
            : member);
        fresh.currentUser = fresh.members.find(member => member.id === userId)!;
        let requestNumber = 0;

        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            requestNumber += 1;
            if (requestNumber === 1) {
                return new Response(JSON.stringify({ revision: 1, data: stale }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ETag: '"family-1"' }
                });
            }
            if (requestNumber === 2) {
                const request = JSON.parse(String(init?.body)) as { mutationId: string };
                return new Response(JSON.stringify({
                    revision: 2,
                    data: fresh,
                    command: { mutationId: request.mutationId, duplicate: false, rebased: false }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ETag: '"family-2"' }
                });
            }
            expect(new Headers(init?.headers).get('If-None-Match')).toBe('"family-2"');
            return new Response(null, { status: 304 });
        }));

        const adapter = new ServerAdapter(new MemoryOutboxPersistence());
        await adapter.loadData();
        const mutationData = await adapter.completeRoutine({ routineId: 'routine-1', units: 3 });
        const cachedAfter304 = await adapter.loadData();

        expect(mutationData.currentUser.xp).toBe(nextXp);
        expect(cachedAfter304.currentUser.xp).toBe(nextXp);
        expect(cachedAfter304.currentUser.xp).toBe(
            cachedAfter304.members.find(member => member.id === userId)?.xp
        );
        expect(requestNumber).toBe(3);
    });
});
