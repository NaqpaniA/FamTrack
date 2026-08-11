export type WishlistVisibility = 'PERSONAL' | 'FAMILY';
export type WishlistPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface WishlistItem {
  id: string;
  wishlistId: string;
  title: string;
  description?: string;
  url?: string;
  priority: WishlistPriority;
  ownerId: string;
  createdById: string;
  createdAt: number;
  reservedById?: string;
  reservedAt?: number;
}

export interface Wishlist {
  id: string;
  title: string;
  visibility: WishlistVisibility;
  ownerId?: string;
  createdById: string;
  createdAt: number;
  items: WishlistItem[];
}
