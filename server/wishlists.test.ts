import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DomainError } from './domain.js';
import { filterForActor } from './rbac.js';
import { filterWishlistsForActor, saveWishlist, saveWishlistItem, setWishlistReservation } from './wishlists.js';

const cloneData = () => {
    const data = JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;
    data.wishlists = [];
    return data;
};

test('wishlist reservation is spoiler-safe for the wish owner but visible to other family members', () => {
    const data = cloneData();
    const owner = data.members[0];
    const reserver = data.members[1];
    const list = saveWishlist(data, { id: 'family-wishes', title: 'Подарки', visibility: 'FAMILY' }, owner, () => 1);
    const withItem = saveWishlistItem(list, {
        id: 'wish-headphones',
        wishlistId: 'family-wishes',
        title: 'Наушники',
        ownerId: owner.id
    }, owner, () => 2);
    const reserved = setWishlistReservation(withItem, 'family-wishes', 'wish-headphones', true, reserver, () => 3);

    assert.equal(filterWishlistsForActor(reserved.wishlists!, owner)[0].items[0].reservedById, undefined);
    assert.equal(filterWishlistsForActor(reserved.wishlists!, reserver)[0].items[0].reservedById, reserver.id);
    assert.equal(filterForActor(reserved, owner).wishlists?.[0].items[0].reservedById, undefined);
    assert.throws(
        () => setWishlistReservation(reserved, 'family-wishes', 'wish-headphones', true, owner, () => 4),
        (error: unknown) => error instanceof DomainError && error.status === 403
    );
});

test('personal wishlists are visible only to their owner', () => {
    const data = cloneData();
    const owner = data.members[0];
    const admin = data.members[1];
    const personal = saveWishlist(data, { id: 'private-list', title: 'Личное', visibility: 'PERSONAL' }, admin, () => 1);
    assert.equal(filterWishlistsForActor(personal.wishlists!, owner).length, 0);
    assert.equal(filterWishlistsForActor(personal.wishlists!, admin).length, 1);
});

test('a second reserver cannot duplicate an existing reservation', () => {
    const data = cloneData();
    const wishOwner = data.members[2];
    const first = data.members[0];
    const second = data.members[1];
    const list = saveWishlist(data, { id: 'shared', title: 'Shared' }, first, () => 1);
    const item = saveWishlistItem(list, { id: 'gift', wishlistId: 'shared', title: 'Gift', ownerId: wishOwner.id }, first, () => 2);
    const reserved = setWishlistReservation(item, 'shared', 'gift', true, first, () => 3);
    assert.throws(
        () => setWishlistReservation(reserved, 'shared', 'gift', true, second, () => 4),
        (error: unknown) => error instanceof DomainError && error.status === 409
    );
});
