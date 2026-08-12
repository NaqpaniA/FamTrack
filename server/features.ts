import type { AppData } from '../types.js';

export interface FeatureCapabilities {
    routines: boolean;
    pantry: boolean;
    receiptOcr: boolean;
    wishlists: boolean;
}

const enabled = (value: string | undefined) => /^(?:1|true|yes|on)$/i.test(value?.trim() || '');

export const readFeatureCapabilities = (env: NodeJS.ProcessEnv = process.env): FeatureCapabilities => {
    const routines = enabled(env.ROUTINES);
    return {
        routines,
        pantry: enabled(env.PANTRY),
        receiptOcr: enabled(env.RECEIPT_OCR),
        // Wishlists ship in the routines/Household Pulse release. A dedicated
        // override is useful in local acceptance without creating a fourth
        // production rollout flag.
        wishlists: routines || enabled(env.WISHLISTS)
    };
};

export const applyCapabilities = (data: AppData, capabilities: FeatureCapabilities): AppData => ({
    ...withoutInternalAggregates(data),
    capabilities,
    routines: capabilities.routines ? data.routines || [] : [],
    routineEvents: capabilities.routines ? data.routineEvents || [] : [],
    routineSummary: capabilities.routines ? data.routineSummary : undefined,
    routineSummaries: capabilities.routines ? data.routineSummaries : undefined,
    wishlists: capabilities.wishlists ? data.wishlists || [] : [],
    pantry: capabilities.pantry ? data.pantry : undefined
});

export const isRoutineCompletionAvailable = (
    data: AppData,
    input: Record<string, unknown>,
    capabilities: FeatureCapabilities
) => {
    if (capabilities.routines) return true;
    const routineId = typeof input.routineId === 'string' ? input.routineId.trim() : '';
    const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : '';
    if (!routineId || !taskId) return false;
    const task = data.tasks.find(item => (
        item.id === taskId
        && item.routineTemplateId === routineId
        && item.status !== 'DONE'
        && item.status !== 'DROPPED'
    ));
    const routine = (data.routines || []).find(item => item.id === routineId && item.openTaskId === taskId);
    return !!task && !!routine;
};

const withoutInternalAggregates = (data: AppData): AppData => {
    const { purchaseImports: _purchaseImports, ...publicData } = data;
    return publicData;
};
