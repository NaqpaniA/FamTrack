import { randomUUID } from 'node:crypto';
import type { AppData } from '../types.js';
import type { User } from '../family.model.js';
import type { Wishlist, WishlistItem } from '../wishlist.model.js';
import { DomainError } from './domain.js';

type IdFactory = () => string;
type Clock = () => number;

export const saveWishlist = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    if (!isObject(raw)) throw new DomainError('Wishlist payload is required');
    const id = stringValue(raw.id, `wishlist-${idFactory()}`, 120);
    const previous = (data.wishlists || []).find(list => list.id === id);
    if (previous && !canManageWishlist(previous, actor)) throw new DomainError('You are not allowed to edit this wishlist', 403);
    const visibility = raw.visibility === 'PERSONAL' ? 'PERSONAL' : raw.visibility === 'FAMILY' ? 'FAMILY' : previous?.visibility || 'FAMILY';
    const wishlist: Wishlist = {
        id,
        title: stringValue(raw.title, previous?.title || 'Список желаний', 120),
        visibility,
        ownerId: visibility === 'PERSONAL' ? previous?.ownerId || actor.id : optionalMemberId(raw.ownerId, data) || previous?.ownerId,
        createdById: previous?.createdById || actor.id,
        createdAt: previous?.createdAt || clock(),
        items: previous?.items || []
    };
    return {
        ...data,
        wishlists: previous
            ? (data.wishlists || []).map(list => list.id === id ? wishlist : list)
            : [...(data.wishlists || []), wishlist]
    };
};

export const saveWishlistItem = (
    data: AppData,
    raw: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    if (!isObject(raw)) throw new DomainError('Wishlist item payload is required');
    const wishlistId = stringValue(raw.wishlistId, '', 120);
    const wishlist = (data.wishlists || []).find(list => list.id === wishlistId);
    if (!wishlist) throw new DomainError('Wishlist not found', 404);
    if (!canManageWishlist(wishlist, actor)) throw new DomainError('You are not allowed to add wishes here', 403);
    const id = stringValue(raw.id, `wish-${idFactory()}`, 120);
    const previous = wishlist.items.find(item => item.id === id);
    const ownerId = optionalMemberId(raw.ownerId, data) || previous?.ownerId || wishlist.ownerId || actor.id;
    const item: WishlistItem = {
        id,
        wishlistId,
        title: stringValue(raw.title, previous?.title || '', 180),
        description: optionalString(raw.description, 1000) || previous?.description,
        url: safeHttpsUrl(raw.url) || previous?.url,
        priority: raw.priority === 'HIGH' || raw.priority === 'LOW' || raw.priority === 'MEDIUM' ? raw.priority : previous?.priority || 'MEDIUM',
        ownerId,
        createdById: previous?.createdById || actor.id,
        createdAt: previous?.createdAt || clock(),
        reservedById: previous?.reservedById,
        reservedAt: previous?.reservedAt
    };
    if (!item.title) throw new DomainError('Wish title is required');
    return {
        ...data,
        wishlists: (data.wishlists || []).map(list => list.id === wishlistId
            ? { ...list, items: previous ? list.items.map(existing => existing.id === id ? item : existing) : [...list.items, item] }
            : list)
    };
};

export const deleteWishlistItem = (data: AppData, wishlistIdValue: unknown, itemIdValue: unknown, actor: User): AppData => {
    const wishlistId = stringValue(wishlistIdValue, '', 120);
    const itemId = stringValue(itemIdValue, '', 120);
    const wishlist = (data.wishlists || []).find(list => list.id === wishlistId);
    if (!wishlist) throw new DomainError('Wishlist not found', 404);
    if (!canManageWishlist(wishlist, actor)) throw new DomainError('You are not allowed to delete this wish', 403);
    if (!wishlist.items.some(item => item.id === itemId)) throw new DomainError('Wish not found', 404);
    return {
        ...data,
        wishlists: (data.wishlists || []).map(list => list.id === wishlistId
            ? { ...list, items: list.items.filter(item => item.id !== itemId) }
            : list)
    };
};

export const setWishlistReservation = (
    data: AppData,
    wishlistIdValue: unknown,
    itemIdValue: unknown,
    reserved: boolean,
    actor: User,
    clock: Clock = Date.now
): AppData => {
    const wishlistId = stringValue(wishlistIdValue, '', 120);
    const itemId = stringValue(itemIdValue, '', 120);
    const wishlist = (data.wishlists || []).find(list => list.id === wishlistId);
    const item = wishlist?.items.find(candidate => candidate.id === itemId);
    if (!wishlist || !item) throw new DomainError('Wish not found', 404);
    if (item.ownerId === actor.id) throw new DomainError('Wish owners cannot inspect or change reservations', 403);
    if (reserved && item.reservedById && item.reservedById !== actor.id) {
        throw new DomainError('Wish is already reserved', 409);
    }
    if (!reserved && item.reservedById && item.reservedById !== actor.id && actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
        throw new DomainError('Only the reserver or an administrator can release this wish', 403);
    }
    return {
        ...data,
        wishlists: (data.wishlists || []).map(list => list.id === wishlistId
            ? {
                ...list,
                items: list.items.map(candidate => candidate.id === itemId
                    ? {
                        ...candidate,
                        reservedById: reserved ? actor.id : undefined,
                        reservedAt: reserved ? clock() : undefined
                    }
                    : candidate)
            }
            : list)
    };
};

export const filterWishlistsForActor = (wishlists: Wishlist[], actor: User) => wishlists
    .filter(list => list.visibility === 'FAMILY' || list.ownerId === actor.id)
    .map(list => ({
        ...list,
        items: list.items.map(item => item.ownerId === actor.id
            ? { ...item, reservedById: undefined, reservedAt: undefined }
            : item)
    }));

const canManageWishlist = (wishlist: Wishlist, actor: User) => (
    actor.role === 'OWNER' || actor.role === 'ADMIN' || wishlist.createdById === actor.id || wishlist.ownerId === actor.id
);
const optionalMemberId = (value: unknown, data: AppData) => typeof value === 'string' && data.members.some(member => member.id === value && member.isActive !== false) ? value : undefined;
const stringValue = (value: unknown, fallback: string, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
const optionalString = (value: unknown, max: number) => stringValue(value, '', max) || undefined;
const safeHttpsUrl = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
