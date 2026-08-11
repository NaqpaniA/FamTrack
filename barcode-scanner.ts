import { normalizeBarcode } from './barcode';

interface NativeBarcodeResult {
    rawValue: string;
}

interface NativeBarcodeDetector {
    detect(source: unknown): Promise<NativeBarcodeResult[]>;
}

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

const nativeDetector = () => {
    const Constructor = (globalThis as typeof globalThis & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
    return Constructor ? new Constructor({ formats: ['ean_8', 'ean_13', 'upc_a', 'upc_e'] }) : undefined;
};

export const scanBarcodeFile = async (file: File) => {
    const detector = nativeDetector();
    if (detector && typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        try {
            const detected = await detector.detect(bitmap);
            const value = detected.map(result => normalizeBarcode(result.rawValue)).find(Boolean);
            if (value) return value;
        } finally {
            bitmap.close();
        }
    }

    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const objectUrl = URL.createObjectURL(file);
    try {
        const result = await reader.decodeFromImageUrl(objectUrl);
        return normalizeBarcode(result.getText());
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

export const startBarcodeCamera = async (
    video: HTMLVideoElement,
    onDetected: (barcode: string) => void,
    onError: (error: Error) => void
) => {
    const detector = nativeDetector();
    if (detector) {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        let active = true;
        let scanning = false;
        video.srcObject = stream;
        video.playsInline = true;
        await video.play();
        const scan = async () => {
            if (!active) return;
            if (!scanning && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                scanning = true;
                try {
                    const detected = await detector.detect(video);
                    const value = detected.map(result => normalizeBarcode(result.rawValue)).find(Boolean);
                    if (value) onDetected(value);
                } catch (error) {
                    onError(error instanceof Error ? error : new Error('Не удалось распознать штрихкод'));
                } finally {
                    scanning = false;
                }
            }
            if (active) window.setTimeout(scan, 180);
        };
        void scan();
        return () => {
            active = false;
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        };
    }

    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 });
    const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        video,
        (result) => {
            const value = normalizeBarcode(result?.getText());
            if (value) onDetected(value);
        }
    );
    return () => controls.stop();
};
