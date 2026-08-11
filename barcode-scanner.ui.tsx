import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Keyboard, Loader2, ScanLine, X } from 'lucide-react';
import { normalizeBarcode } from './barcode';
import { scanBarcodeFile, startBarcodeCamera } from './barcode-scanner';

export const BarcodeScanner = ({ onDetected, onClose }: { onDetected: (barcode: string) => void; onClose: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const handledRef = useRef(false);
    const onDetectedRef = useRef(onDetected);
    onDetectedRef.current = onDetected;
    const [error, setError] = useState('');
    const [manual, setManual] = useState('');
    const [starting, setStarting] = useState(true);

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        let mounted = true;
        const video = videoRef.current;
        if (!video) return;
        startBarcodeCamera(video, barcode => {
            if (handledRef.current) return;
            handledRef.current = true;
            onDetectedRef.current(barcode);
        }, cameraError => {
            if (mounted) setError(cameraError.message);
        }).then(stop => {
            if (!mounted) stop();
            else cleanup = stop;
        }).catch(cameraError => {
            if (mounted) setError(cameraError instanceof Error ? cameraError.message : 'Камера недоступна');
        }).finally(() => {
            if (mounted) setStarting(false);
        });
        return () => {
            mounted = false;
            cleanup?.();
        };
    }, []);

    const submitManual = () => {
        const barcode = normalizeBarcode(manual);
        if (!barcode) {
            setError('Проверьте длину и контрольную цифру EAN/UPC.');
            return;
        }
        onDetected(barcode);
    };

    const scanFile = async (file?: File) => {
        if (!file) return;
        setError('');
        try {
            const barcode = await scanBarcodeFile(file);
            if (!barcode) throw new Error('Штрихкод на изображении не найден');
            onDetected(barcode);
        } catch (fileError) {
            setError(fileError instanceof Error ? fileError.message : 'Не удалось прочитать изображение');
        }
    };

    return (
        <div
            className="fixed left-0 right-0 top-0 z-[80] flex flex-col bg-black text-white"
            style={{
                height: 'var(--app-visual-height, var(--tg-viewport-height, 100dvh))',
                paddingTop: 'var(--app-safe-top)',
                paddingBottom: 'var(--app-safe-bottom)'
            }}
        >
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2 font-black"><ScanLine size={20} /> Штрихкод</div>
                <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label="Закрыть сканер"><X size={20} /></button>
            </div>
            <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-[24px] bg-gray-900">
                <video ref={videoRef} muted className="h-full w-full object-cover" aria-label="Предпросмотр камеры" />
                <div className="pointer-events-none absolute inset-[18%_10%] rounded-3xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.35)]" />
                {starting ? <div className="absolute inset-0 grid place-items-center"><Loader2 className="animate-spin" /></div> : null}
            </div>
            <div className="space-y-3 p-4">
                {error ? <p className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-100" role="alert">{error}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm font-bold">
                        <ImagePlus size={18} /> Фото
                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => void scanFile(event.target.files?.[0])} />
                    </label>
                    <div className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/10 px-3">
                        <Keyboard size={17} className="shrink-0" />
                        <input value={manual} onChange={event => setManual(event.target.value)} inputMode="numeric" placeholder="EAN / UPC" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35" />
                        <button type="button" onClick={submitManual} className="rounded-lg bg-white px-2 py-1 text-xs font-black text-black">OK</button>
                    </div>
                </div>
                <p className="flex items-center justify-center gap-2 text-center text-[11px] text-white/50"><Camera size={13} /> Видео обрабатывается только на устройстве и не отправляется на сервер.</p>
            </div>
        </div>
    );
};
