import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Check,
    ChevronDown,
    CircleMinus,
    MapPin,
    Package,
    PackageCheck,
    Pencil,
    Plus,
    ReceiptText,
    ScanLine,
    X
} from 'lucide-react';
import type { AppData } from './types';
import type { PantryProduct } from './pantry.model';
import type { PurchaseImportJob } from './purchase-import.model';
import { api } from './api';
import { Modal, Panel } from './ui-kit';
import { formatMoney } from './utils';

const BarcodeScanner = React.lazy(() => import('./barcode-scanner.ui').then(module => ({ default: module.BarcodeScanner })));

interface PantryAdjustment {
    productId?: string;
    quantityDelta?: number;
    type?: string;
    name?: string;
    barcode?: string;
    unit?: string;
    location?: string;
    note?: string;
    finished?: boolean;
}

export const PantryView = ({ data, onAdjust }: { data: AppData; onAdjust: (input: PantryAdjustment) => void }) => {
    const pantry = data.pantry || { products: [], recentMovements: [], totalProducts: 0, lowStockCount: 0 };
    const products = useMemo(() => [...pantry.products].sort((left, right) => left.name.localeCompare(right.name, 'ru')), [pantry.products]);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [draftId, setDraftId] = useState<string>();
    const [job, setJob] = useState<PurchaseImportJob>();
    const [pendingBarcode, setPendingBarcode] = useState<string>();
    const [unknownName, setUnknownName] = useState('');
    const [merchant, setMerchant] = useState('');
    const [amountRubles, setAmountRubles] = useState('');
    const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
    const isChild = data.currentUser.role === 'CHILD';
    const [stockOnly, setStockOnly] = useState(isChild);
    const [editingProduct, setEditingProduct] = useState<PantryProduct>();
    const [manualName, setManualName] = useState('');
    const [manualQuantity, setManualQuantity] = useState('1');
    const [manualLocation, setManualLocation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!data.capabilities?.pantry && !data.capabilities?.receiptOcr) return;
        let active = true;
        void api.listPurchaseImports().then(jobs => {
            if (!active) return;
            const open = jobs.find(candidate => !['CONFIRMED', 'CANCELLED'].includes(candidate.status));
            if (!open) return;
            setDraftId(open.id);
            setJob(open);
            setStockOnly(isChild ? true : open.stockOnly);
            setAccountId(open.accountId || data.accounts[0]?.id || '');
            setMerchant(open.merchant || '');
            setAmountRubles(open.totalAmount ? String(open.totalAmount / 100).replace('.', ',') : '');
        }).catch(() => undefined);
        return () => { active = false; };
    }, [data.capabilities?.pantry, data.capabilities?.receiptOcr, data.currentUser.id, data.accounts[0]?.id, isChild]);

    useEffect(() => {
        if (!draftId || !job || !['QUEUED', 'PROCESSING'].includes(job.status)) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const next = await api.loadPurchaseImport(draftId);
                if (!active) return;
                setJob(next);
                if (next.merchant) setMerchant(next.merchant);
                if (next.totalAmount) setAmountRubles(String(next.totalAmount / 100).replace('.', ','));
                if (['QUEUED', 'PROCESSING'].includes(next.status)) timer = setTimeout(poll, 1500);
                else if (next.status.startsWith('FAILED')) setError('Чек не удалось распознать. Можно повторить обработку или заполнить покупку вручную.');
            } catch (pollError) {
                if (active) timer = setTimeout(poll, 2500);
            }
        };
        timer = setTimeout(poll, 500);
        return () => {
            active = false;
            if (timer) clearTimeout(timer);
        };
    }, [draftId, job?.status]);

    const newDraftId = () => {
        if (typeof crypto.randomUUID === 'function') return `purchase-import-${crypto.randomUUID()}`;
        return `purchase-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    };
    const ensureDraft = async () => {
        if (draftId) return draftId;
        const id = newDraftId();
        await api.createPurchaseImport({
            id,
            source: 'BARCODE',
            stockOnly: isChild ? true : stockOnly,
            accountId: accountId || undefined,
            merchant: merchant || undefined
        });
        setDraftId(id);
        return id;
    };
    const reloadJob = async (id: string) => {
        const next = await api.loadPurchaseImport(id);
        setJob(next);
        return next;
    };
    const importReceipt = async (files: FileList | null) => {
        if (!files?.length || busy) return;
        if (files.length > 3) {
            setError('Один чек может содержать не больше трёх страниц.');
            return;
        }
        setBusy(true);
        setError('');
        const id = newDraftId();
        try {
            await api.createPurchaseImport({
                id,
                source: 'RECEIPT',
                stockOnly: isChild,
                accountId: isChild ? undefined : accountId || undefined
            });
            setDraftId(id);
            for (let index = 0; index < files.length; index += 1) {
                await api.uploadPurchaseImportPage(id, index + 1, files[index]);
            }
            await api.processPurchaseImport(id);
            const next = await reloadJob(id);
            setStockOnly(isChild ? true : next.stockOnly);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить чек');
            await reloadJob(id).catch(() => undefined);
        } finally {
            setBusy(false);
        }
    };
    const addDetectedBarcode = async (barcode: string, name?: string) => {
        setBusy(true);
        setError('');
        try {
            const id = await ensureDraft();
            await api.addPurchaseBarcode(id, { barcode, name });
            await reloadJob(id);
            setPendingBarcode(undefined);
            setUnknownName('');
        } catch (scanError) {
            setError(scanError instanceof Error ? scanError.message : 'Не удалось добавить товар');
        } finally {
            setBusy(false);
        }
    };
    const onBarcodeDetected = useCallback((barcode: string) => {
        setScannerOpen(false);
        const known = pantry.products.find(product => product.identifiers.some(identifier => identifier.value === barcode));
        if (known) void addDetectedBarcode(barcode, known.name);
        else setPendingBarcode(barcode);
    }, [pantry.products, draftId, stockOnly, accountId, merchant]);
    const confirmDraft = async () => {
        if (!draftId || !job || busy) return;
        const totalAmount = Math.round(Number(amountRubles.replace(',', '.')) * 100);
        if (!stockOnly && (!accountId || !Number.isFinite(totalAmount) || totalAmount <= 0)) {
            setError('Для расхода выберите счёт и укажите сумму чека.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await api.updatePurchaseImport(draftId, {
                stockOnly: isChild ? true : stockOnly,
                accountId: stockOnly ? undefined : accountId,
                totalAmount: stockOnly ? undefined : totalAmount,
                merchant: merchant.trim() || undefined
            });
            await api.confirmPurchaseImport(draftId);
            setDraftId(undefined);
            setJob(undefined);
            setMerchant('');
            setAmountRubles('');
            setStockOnly(isChild);
        } catch (confirmError) {
            setError(confirmError instanceof Error ? confirmError.message : 'Не удалось подтвердить покупку');
        } finally {
            setBusy(false);
        }
    };
    const resetDraft = () => {
        const id = draftId;
        setDraftId(undefined);
        setJob(undefined);
        setPendingBarcode(undefined);
        setUnknownName('');
        setError('');
        if (id && job?.status !== 'CONFIRMED') void api.cancelPurchaseImport(id).catch(() => undefined);
    };
    const updateReviewItem = async (item: PurchaseImportJob['items'][number], patch: Partial<PurchaseImportJob['items'][number]>) => {
        if (!draftId || busy) return;
        setBusy(true);
        setError('');
        try {
            await api.savePurchaseImportItem(draftId, { ...item, ...patch });
            await reloadJob(draftId);
        } catch (itemError) {
            setError(itemError instanceof Error ? itemError.message : 'Не удалось сохранить проверку позиции');
        } finally {
            setBusy(false);
        }
    };
    const addManualStock = () => {
        if (!manualName.trim() || Number(manualQuantity) <= 0) return;
        onAdjust({
            name: manualName.trim(),
            quantityDelta: Number(manualQuantity),
            type: 'CORRECTION',
            location: manualLocation.trim() || undefined
        });
        setManualName('');
        setManualQuantity('1');
        setManualLocation('');
    };

    return (
        <div className="space-y-4">
            <div className={`grid gap-2 ${data.capabilities?.receiptOcr ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
                <button type="button" onClick={() => setScannerOpen(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 text-sm font-black text-white shadow-lg active:scale-[0.98]"><ScanLine size={19} /> Сканировать</button>
                {data.capabilities?.receiptOcr ? (
                    <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 px-2 text-center text-sm font-black text-white shadow-lg active:scale-[0.98]">
                        <ReceiptText size={19} /> Чек
                        <input
                            type="file"
                            accept="image/jpeg,image/png"
                            capture="environment"
                            multiple
                            className="sr-only"
                            disabled={busy}
                            onChange={event => {
                                void importReceipt(event.target.files);
                                event.target.value = '';
                            }}
                        />
                    </label>
                ) : null}
                <button type="button" onClick={() => setEditingProduct({} as PantryProduct)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/60 px-4 text-sm font-black text-gray-800 active:scale-[0.98]"><Plus size={19} /> Вручную</button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <Stat value={pantry.totalProducts} label="позиций" />
                <Stat value={pantry.lowStockCount} label="заканчивается" />
                <Stat value={pantry.recentMovements.length} label="движений" />
            </div>

            {error ? <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div> : null}

            {job ? (
                <Panel className="overflow-hidden border border-blue-100">
                    <div className="flex items-center justify-between bg-blue-50/70 px-4 py-3">
                        <div>
                            <div className="text-sm font-black text-blue-950">{job.source === 'RECEIPT' ? 'Проверка чека' : 'Черновик покупки'}</div>
                            <div className="text-[11px] text-blue-600">{job.status === 'QUEUED' || job.status === 'PROCESSING' ? 'Распознаём локальным OCR…' : `${job.items.length} позиций · подтвердите перед учётом`}</div>
                        </div>
                        <button type="button" onClick={resetDraft} className="grid h-9 w-9 place-items-center rounded-full text-blue-400" aria-label="Закрыть черновик"><X size={17} /></button>
                    </div>
                    <div className="divide-y divide-black/5">
                        {job.items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                                <button type="button" onClick={() => void updateReviewItem(item, { confirmed: !item.confirmed })} className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.confirmed ? 'bg-emerald-500 text-white' : 'border border-black/10 text-gray-300'}`} aria-label={item.confirmed ? `Исключить ${item.title}` : `Подтвердить ${item.title}`}><Check size={16} /></button>
                                <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.title}</div><div className="text-[11px] text-gray-400">{item.barcode ? `${item.barcode} · ` : ''}{item.quantity} {item.unit || 'шт.'}{item.totalPrice ? ` · ${formatMoney(item.totalPrice)}` : ''}</div></div>
                                <button type="button" onClick={() => void updateReviewItem(item, { includeInPantry: !item.includeInPantry })} className={`min-h-8 rounded-xl px-2 text-[10px] font-black ${item.includeInPantry ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`} aria-pressed={item.includeInPantry}>В запасы</button>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3 border-t border-black/5 p-4">
                        {job.source === 'RECEIPT' && ['QUEUED', 'PROCESSING'].includes(job.status) ? (
                            <div className="rounded-xl bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700">Фото остаётся в FamTrack и передаётся только внутреннему OCR-сервису. Финансовая операция появится лишь после вашего подтверждения.</div>
                        ) : null}
                        {job.status === 'FAILED_RETRYABLE' ? (
                            <button type="button" onClick={() => {
                                if (!draftId) return;
                                setError('');
                                void api.processPurchaseImport(draftId).then(() => reloadJob(draftId)).catch(retryError => {
                                    setError(retryError instanceof Error ? retryError.message : 'Повтор OCR не запустился');
                                });
                            }} className="min-h-11 w-full rounded-xl bg-amber-50 text-sm font-black text-amber-800">Повторить распознавание</button>
                        ) : null}
                        {job.status === 'FAILED_FINAL' ? (
                            <div className="rounded-xl bg-red-50 px-3 py-3 text-xs font-semibold text-red-700">OCR отклонил чек после повторов. Закройте черновик и добавьте покупку штрихкодом или вручную.</div>
                        ) : null}
                        <input value={merchant} onChange={event => setMerchant(event.target.value)} placeholder="Магазин (необязательно)" className="w-full rounded-xl bg-black/[0.035] px-3 py-2.5 text-sm outline-none" />
                        {!isChild ? (
                            <label className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.035] px-3 py-2.5 text-sm font-semibold">
                                Только запасы, без расхода
                                <input type="checkbox" checked={stockOnly} onChange={event => setStockOnly(event.target.checked)} />
                            </label>
                        ) : <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">Детский черновик обновит только запасы. Расход по счёту подтверждает родитель.</p>}
                        {!stockOnly && !isChild ? (
                            <div className="grid grid-cols-2 gap-2">
                                <label className="min-w-0 space-y-1"><span className="text-[10px] font-bold uppercase text-gray-400">Сумма, ₽</span><input value={amountRubles} onChange={event => setAmountRubles(event.target.value)} inputMode="decimal" placeholder="0" className="w-full min-w-0 rounded-xl bg-black/[0.035] px-3 py-2.5 text-sm font-bold outline-none" /></label>
                                <label className="min-w-0 space-y-1"><span className="text-[10px] font-bold uppercase text-gray-400">Счёт</span><select value={accountId} onChange={event => setAccountId(event.target.value)} className="w-full min-w-0 rounded-xl bg-black/[0.035] px-3 py-2.5 text-sm outline-none">{data.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setScannerOpen(true)} className="min-h-11 rounded-xl bg-blue-50 text-sm font-bold text-blue-700">Ещё товар</button>
                            <button type="button" onClick={() => void confirmDraft()} disabled={busy || !job.items.some(item => item.confirmed) || ['QUEUED', 'PROCESSING'].includes(job.status)} className="min-h-11 rounded-xl bg-gray-950 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Сохраняю…' : stockOnly ? 'Учесть запас' : 'Записать расход и запасы'}</button>
                        </div>
                    </div>
                </Panel>
            ) : null}

            <div className="space-y-2">
                {products.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-black/10 p-8 text-center text-sm text-gray-400"><PackageCheck size={36} className="mx-auto mb-3 opacity-30" />Запасы пока пусты. Отсканируйте первую покупку.</div>
                ) : products.map(product => (
                    <div key={product.id}>
                    <Panel className="flex items-center gap-3 p-3">
                        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${product.quantity <= (product.lowStockThreshold ?? 0) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}><Package size={20} /></div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black">{product.name}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400"><span>{product.quantity} {product.unit}</span>{product.location ? <span className="flex min-w-0 items-center gap-0.5"><MapPin size={10} /><span className="truncate">{product.location}</span></span> : null}</div>
                        </div>
                        <button type="button" onClick={() => onAdjust({ productId: product.id, quantityDelta: -1, type: 'CONSUME' })} disabled={product.quantity <= 0} className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 text-gray-700 disabled:opacity-30" aria-label={`Уменьшить ${product.name} на один`}><CircleMinus size={17} /></button>
                        <button type="button" onClick={() => onAdjust({ productId: product.id, finished: true, type: 'CONSUME' })} disabled={product.quantity <= 0} className="min-h-9 rounded-xl bg-amber-50 px-2 text-[10px] font-black text-amber-700 disabled:opacity-30">Закончилось</button>
                        <button type="button" onClick={() => { setEditingProduct(product); setManualName(product.name); setManualQuantity(''); setManualLocation(product.location || ''); }} className="grid h-9 w-9 place-items-center text-gray-300" aria-label={`Изменить ${product.name}`}><Pencil size={15} /></button>
                    </Panel>
                    </div>
                ))}
            </div>

            {pantry.recentMovements.length > 0 ? (
                <details className="rounded-2xl border border-black/5 bg-white/40 p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">Последние движения <ChevronDown size={16} /></summary>
                    <div className="mt-2 divide-y divide-black/5">{pantry.recentMovements.slice(0, 10).map(movement => {
                        const product = pantry.products.find(candidate => candidate.id === movement.productId);
                        return <div key={movement.id} className="flex items-center justify-between py-2 text-xs"><span className="truncate text-gray-600">{product?.name || movement.productId}</span><span className={movement.quantityDelta > 0 ? 'font-bold text-emerald-600' : 'font-bold text-red-500'}>{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta} → {movement.quantityAfter}</span></div>;
                    })}</div>
                </details>
            ) : null}

            {scannerOpen ? (
                <React.Suspense fallback={<div className="fixed inset-0 z-[80] grid place-items-center bg-black text-white">Открываю камеру…</div>}>
                    <BarcodeScanner onDetected={onBarcodeDetected} onClose={() => setScannerOpen(false)} />
                </React.Suspense>
            ) : null}

            <Modal isOpen={!!pendingBarcode} onClose={() => setPendingBarcode(undefined)} title="Новый товар">
                <div className="space-y-4 pb-8">
                    <p className="text-sm text-gray-500">Штрихкод <span className="font-mono font-bold text-gray-800">{pendingBarcode}</span> ещё не знаком семье. Название понадобится только один раз.</p>
                    <input value={unknownName} onChange={event => setUnknownName(event.target.value)} autoFocus maxLength={240} placeholder="Например, молоко 3,2%" className="w-full rounded-xl bg-gray-50 p-3 text-sm outline-none" />
                    <button type="button" onClick={() => pendingBarcode && void addDetectedBarcode(pendingBarcode, unknownName)} disabled={!unknownName.trim() || busy} className="min-h-12 w-full rounded-xl bg-gray-950 font-bold text-white disabled:opacity-40">Добавить в черновик</button>
                </div>
            </Modal>

            <Modal isOpen={!!editingProduct} onClose={() => setEditingProduct(undefined)} title={editingProduct?.id ? 'Корректировка' : 'Новый запас'}>
                <div className="space-y-3 pb-8">
                    <label className="space-y-1"><span className="text-xs font-bold uppercase text-gray-400">Название</span><input value={manualName} disabled={!!editingProduct?.id} onChange={event => setManualName(event.target.value)} className="w-full rounded-xl bg-gray-50 p-3 text-sm outline-none disabled:text-gray-400" /></label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1"><span className="text-xs font-bold uppercase text-gray-400">Изменить на</span><input value={manualQuantity} onChange={event => setManualQuantity(event.target.value)} inputMode="decimal" placeholder={editingProduct?.id ? '+1 или −1' : '1'} className="w-full rounded-xl bg-gray-50 p-3 text-sm outline-none" /></label>
                        <label className="space-y-1"><span className="text-xs font-bold uppercase text-gray-400">Место</span><input value={manualLocation} onChange={event => setManualLocation(event.target.value)} placeholder="Холодильник" className="w-full rounded-xl bg-gray-50 p-3 text-sm outline-none" /></label>
                    </div>
                    <button type="button" onClick={() => {
                        if (editingProduct?.id) onAdjust({ productId: editingProduct.id, quantityDelta: Number(manualQuantity), type: 'CORRECTION', location: manualLocation || undefined });
                        else addManualStock();
                        setEditingProduct(undefined);
                    }} disabled={!editingProduct?.id && !manualName.trim() || !Number.isFinite(Number(manualQuantity)) || Number(manualQuantity) === 0} className="min-h-12 w-full rounded-xl bg-gray-950 font-bold text-white disabled:opacity-40">Сохранить</button>
                </div>
            </Modal>
        </div>
    );
};

const Stat = ({ value, label }: { value: number; label: string }) => (
    <div className="rounded-2xl bg-black/[0.035] p-3 text-center"><div className="text-lg font-black">{value}</div><div className="text-[10px] font-bold uppercase text-gray-400">{label}</div></div>
);
