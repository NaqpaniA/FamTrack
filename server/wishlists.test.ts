import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import { DomainError } from './domain.js';
import { filterForActor } from './rbac.js';
import { deleteWishlistItem, filterWishlistsForActor, saveWishlist, saveWishlistItem, setWishlistReservation } from './wishlists.js';

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

test('a family member can create, edit and delete only their own family wish', () => {
    const data = cloneData();
    const listOwner = data.members[0];
    const member = data.members.find(candidate => candidate.role === 'CHILD') || data.members[1];
    const list = saveWishlist(data, { id: 'family-list', title: 'Family', visibility: 'FAMILY' }, listOwner, () => 1);
    const created = saveWishlistItem(list, {
        id: 'member-wish',
        wishlistId: 'family-list',
        title: 'Book',
        description: 'First edition',
        url: 'https://example.com/book',
        priority: 'HIGH',
        ownerId: listOwner.id
    }, member, () => 2);
    const item = created.wishlists![0].items[0];
    assert.equal(item.ownerId, member.id, 'non-admin members cannot forge another wish owner');

    const edited = saveWishlistItem(created, {
        ...item,
        wishlistId: 'family-list',
        title: 'Better book',
        description: '',
        url: '',
        priority: 'LOW'
    }, member, () => 3);
    assert.equal(edited.wishlists![0].items[0].title, 'Better book');
    assert.equal(edited.wishlists![0].items[0].description, undefined);
    assert.equal(edited.wishlists![0].items[0].url, undefined);
    assert.equal(edited.wishlists![0].items[0].priority, 'LOW');

    const deleted = deleteWishlistItem(edited, 'family-list', 'member-wish', member);
    assert.equal(deleted.wishlists![0].items.length, 0);
});

test('wishlist URLs require HTTPS and personal wishes cannot be reserved', () => {
    const data = cloneData();
    const owner = data.members[0];
    const other = data.members[1];
    const personal = saveWishlist(data, { id: 'personal-list', visibility: 'PERSONAL' }, owner, () => 1);
    assert.throws(
        () => saveWishlistItem(personal, { wishlistId: 'personal-list', title: 'Unsafe', url: 'http://example.com' }, owner, () => 2),
        (error: unknown) => error instanceof DomainError && error.status === 400
    );
    const wish = saveWishlistItem(personal, { id: 'private-wish', wishlistId: 'personal-list', title: 'Private' }, owner, () => 3);
    assert.throws(
        () => setWishlistReservation(wish, 'personal-list', 'private-wish', true, other, () => 4),
        (error: unknown) => error instanceof DomainError && error.status === 403
    );
});
