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
    wishlists: capabilities.wishlists ? data.wishlists || [] : [],
    pantry: capabilities.pantry ? data.pantry : undefined
});

const withoutInternalAggregates = (data: AppData): AppData => {
    const { purchaseImports: _purchaseImports, ...publicData } = data;
    return publicData;
};
