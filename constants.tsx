
// Moved to domain models (finance.model.ts, tasks.model.ts)

// z-index scale — mirrors tailwind.config.js theme.extend.zIndex.
// See ADR 012 §3.1 for the layering rationale (nav < fab < sheet < modal < toast < critical).
export const Z = {
    nav: 'z-nav',
    fab: 'z-fab',
    sheet: 'z-sheet',
    modal: 'z-modal',
    toast: 'z-toast',
    critical: 'z-critical'
} as const;
