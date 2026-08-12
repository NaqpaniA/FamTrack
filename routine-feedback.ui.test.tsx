import { describe, expect, it } from 'vitest';
import { INITIAL_DATA } from './data';
import { routineCompletionFeedback, routineUnitRecordedFeedback } from './routine-feedback';
import type { AppData } from './types';

const cloneData = () => JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;

describe('routine feedback', () => {
    it('distinguishes accumulation from rewarded batch completion', () => {
        const data = cloneData();
        const credited = data.members[1];
        data.routineEvents = [{
            id: 'completion-1',
            routineId: 'routine-1',
            type: 'COMPLETED',
            actorId: data.currentUser.id,
            units: 4,
            xpAwarded: 115,
            timestamp: 1,
            payload: { creditedUserId: credited.id }
        }];

        expect(routineUnitRecordedFeedback(1)).toBe('+1 накоплено');
        expect(routineCompletionFeedback(data, 'routine-1')).toBe(`+115 XP → ${credited.name}`);
    });
});
