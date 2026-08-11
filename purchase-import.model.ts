export type PurchaseImportStatus =
  | 'DRAFT'
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'REVIEW_REQUIRED'
  | 'READY_TO_CONFIRM'
  | 'CONFIRMED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL'
  | 'CANCELLED';

export interface PurchaseImportFile {
  page: number;
  /** Internal storage path. It is removed from every client-facing payload. */
  path?: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface ReceiptOcrBlock {
  page: number;
  text: string;
  confidence: number;
  polygon: number[][];
}

export interface PurchaseImportItem {
  id: string;
  importId: string;
  title: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  barcode?: string;
  pantryProductId?: string;
  shoppingItemId?: string;
  confirmed: boolean;
  includeInPantry: boolean;
  unit?: string;
  location?: string;
}

export interface PurchaseImportJob {
  id: string;
  familyId: string;
  actorId: string;
  source: 'BARCODE' | 'RECEIPT';
  status: PurchaseImportStatus;
  stockOnly: boolean;
  accountId?: string;
  categoryId: string;
  merchant?: string;
  purchasedAt?: string;
  totalAmount?: number;
  pageCount: number;
  retryCount: number;
  errorCode?: string;
  processingStartedAt?: number;
  retentionUntil?: number;
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  resultTransactionId?: string;
  sourceReceiptHash?: string;
  files?: PurchaseImportFile[];
  ocrBlocks?: ReceiptOcrBlock[];
  qrText?: string;
  confirmedResult?: {
    transactionId?: string;
    pantryMovementIds: string[];
    closedShoppingItemIds: string[];
  };
  items: PurchaseImportItem[];
}
