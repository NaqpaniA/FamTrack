import { useCallback, useRef, useState } from 'react';

export const useTaskActionGuard = () => {
    const locks = useRef(new Set<string>());
    const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set());

    const run = useCallback(async <T,>(taskId: string, operation: () => Promise<T>): Promise<T | undefined> => {
        if (locks.current.has(taskId)) return undefined;
        locks.current.add(taskId);
        setPendingTaskIds(new Set(locks.current));
        try {
            return await operation();
        } finally {
            locks.current.delete(taskId);
            setPendingTaskIds(new Set(locks.current));
        }
    }, []);

    return { pendingTaskIds, run };
};
