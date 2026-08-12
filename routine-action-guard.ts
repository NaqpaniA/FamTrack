import { useCallback, useRef, useState } from 'react';

export const useRoutineActionGuard = () => {
    const locks = useRef(new Set<string>());
    const [pendingRoutineIds, setPendingRoutineIds] = useState<ReadonlySet<string>>(new Set());

    const run = useCallback(async <T,>(routineId: string, operation: () => Promise<T>): Promise<T | undefined> => {
        if (locks.current.has(routineId)) return undefined;
        locks.current.add(routineId);
        setPendingRoutineIds(new Set(locks.current));
        try {
            return await operation();
        } finally {
            locks.current.delete(routineId);
            setPendingRoutineIds(new Set(locks.current));
        }
    }, []);

    return { pendingRoutineIds, run };
};
