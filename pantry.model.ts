export type PantryMovementType = 'PURCHASE' | 'CONSUME' | 'DISCARD' | 'CORRECTION' | 'ROLLBACK';

export interface PantryIdentifier {
  kind: 'EAN_8' | 'EAN_13' | 'UPC_A' | 'INTERNAL';
  value: string;
}

export interface PantryProduct {
  id: string;
  name: string;
  aliases: string[];
  identifiers: PantryIdentifier[];
  quantity: number;
  unit: string;
  location?: string;
  lowStockThreshold?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PantryMovement {
  id: string;
  productId: string;
  type: PantryMovementType;
  quantityDelta: number;
  quantityAfter: number;
  actorId: string;
  sourceId?: string;
  rollbackOfId?: string;
  note?: string;
  createdAt: number;
}

export interface PantryData {
  products: PantryProduct[];
  recentMovements: PantryMovement[];
  totalProducts: number;
  lowStockCount: number;
}
