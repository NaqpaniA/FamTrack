import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scannerMocks = vi.hoisted(() => ({
    start: vi.fn(),
    file: vi.fn()
}));

vi.mock('./barcode-scanner', () => ({
    startBarcodeCamera: scannerMocks.start,
    scanBarcodeFile: scannerMocks.file
}));

import { BarcodeScanner } from './barcode-scanner.ui';

describe('BarcodeScanner close contract', () => {
    let telegramBack: (() => void) | undefined;
    let stopCamera: () => void;
    let cameraDetected: ((barcode: string) => void) | undefined;

    beforeEach(() => {
        telegramBack = undefined;
        stopCamera = vi.fn();
        scannerMocks.start.mockImplementation(async (_video: HTMLVideoElement, detected: (barcode: string) => void) => {
            cameraDetected = detected;
            return stopCamera;
        });
        Object.defineProperty(window, 'Telegram', {
            configurable: true,
            value: {
                WebApp: {
                    BackButton: {
                        show: vi.fn(),
                        hide: vi.fn(),
                        onClick: vi.fn((handler: () => void) => { telegramBack = handler; }),
                        offClick: vi.fn((handler: () => void) => {
                            if (telegramBack === handler) telegramBack = undefined;
                        })
                    }
                }
            }
        });
    });

    it.each(['top', 'bottom', 'escape', 'telegram'] as const)('closes through %s and stops the camera once', async method => {
        const onClose = vi.fn();
        render(<BarcodeScanner onDetected={() => undefined} onClose={onClose} />);
        await waitFor(() => expect(scannerMocks.start).toHaveBeenCalledTimes(1));

        if (method === 'top') fireEvent.click(screen.getByRole('button', { name: 'К запасам' }));
        if (method === 'bottom') fireEvent.click(screen.getByRole('button', { name: 'Закрыть сканер' }));
        if (method === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
        if (method === 'telegram') act(() => telegramBack?.());

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(stopCamera).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(window, { key: 'Escape' });
        act(() => telegramBack?.());
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(stopCamera).toHaveBeenCalledTimes(1);
    });

    it('exposes two 44px-or-larger screen actions', async () => {
        render(<BarcodeScanner onDetected={() => undefined} onClose={() => undefined} />);
        await waitFor(() => expect(scannerMocks.start).toHaveBeenCalledTimes(1));
        const top = screen.getByRole('button', { name: 'К запасам' });
        expect(top.className).toContain('min-h-11');
        expect(top.className).toContain('text-white');
        const bottom = screen.getByRole('button', { name: 'Закрыть сканер' });
        expect(bottom.className).toContain('min-h-11');
        expect(bottom.className).toContain('w-full');
    });

    it('ignores a recognition result that arrives after close', async () => {
        const onDetected = vi.fn();
        render(<BarcodeScanner onDetected={onDetected} onClose={() => undefined} />);
        await waitFor(() => expect(cameraDetected).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: 'Закрыть сканер' }));
        act(() => cameraDetected?.('4601234567893'));
        expect(onDetected).not.toHaveBeenCalled();
        expect(stopCamera).toHaveBeenCalledTimes(1);
    });

    it('stops a camera that finishes starting after the scanner has closed', async () => {
        let resolveStart: ((stop: () => void) => void) | undefined;
        scannerMocks.start.mockReturnValue(new Promise(resolve => { resolveStart = resolve; }));
        const onClose = vi.fn();
        render(<BarcodeScanner onDetected={() => undefined} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'К запасам' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        await act(async () => resolveStart?.(stopCamera));
        await waitFor(() => expect(stopCamera).toHaveBeenCalledTimes(1));
    });
});
