import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { SaveState } from './api';

const SAVED_VISIBLE_MS = 1_500;

export const SaveStateIndicator = ({
    state,
    onRetry,
    savedVisibleMs = SAVED_VISIBLE_MS
}: {
    state: SaveState;
    onRetry: () => void | Promise<unknown>;
    savedVisibleMs?: number;
}) => {
    const observedPendingState = useRef(state.status !== 'SAVED');
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        if (state.status !== 'SAVED') {
            observedPendingState.current = true;
            setShowSaved(false);
            return;
        }
        if (!observedPendingState.current) return;

        observedPendingState.current = false;
        setShowSaved(true);
        const timeout = window.setTimeout(() => setShowSaved(false), savedVisibleMs);
        return () => window.clearTimeout(timeout);
    }, [savedVisibleMs, state.status]);

    if (state.status === 'SAVED' && !showSaved) return null;

    if (state.status === 'CHECK') {
        return (
            <button
                type="button"
                className="save-state-pill save-state-pill--check flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-xs font-bold"
                onClick={() => void onRetry()}
                aria-live="polite"
                title={state.message || 'Повторить отправку неподтверждённых изменений'}
            >
                <AlertTriangle size={15} className="shrink-0 text-amber-500" />
                <span className="truncate">Нужна проверка{state.pending > 1 ? ` · ${state.pending}` : ''}</span>
                <RefreshCw size={14} className="shrink-0" aria-hidden="true" />
            </button>
        );
    }

    return (
        <div
            className="save-state-pill flex min-h-9 items-center justify-center gap-2 px-3 py-2 text-xs font-bold"
            role="status"
            aria-live="polite"
            title={state.message || undefined}
        >
            {state.status === 'SAVING' ? (
                <Loader2 size={15} className="shrink-0 animate-spin text-blue-500" />
            ) : (
                <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
            )}
            <span className="truncate">
                {state.status === 'SAVING'
                    ? `Сохраняется${state.pending > 1 ? ` · ${state.pending}` : ''}`
                    : 'Сохранено'}
            </span>
        </div>
    );
};
