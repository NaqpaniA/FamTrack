import assert from 'node:assert/strict';
import test from 'node:test';
import { familyRevisionEtag, requestEtagMatches } from './http-cache.js';

test('family revision ETags are stable per family and revision', () => {
    assert.equal(familyRevisionEtag('fam-one', 42), familyRevisionEtag('fam-one', 42));
    assert.notEqual(familyRevisionEtag('fam-one', 42), familyRevisionEtag('fam-two', 42));
    assert.notEqual(familyRevisionEtag('fam-one', 42), familyRevisionEtag('fam-one', 43));
});

test('If-None-Match accepts weak and list validators', () => {
    const etag = familyRevisionEtag('fam-one', 42);
    assert.equal(requestEtagMatches(undefined, etag), false);
    assert.equal(requestEtagMatches(`"other", W/${etag}`, etag), true);
    assert.equal(requestEtagMatches('*', etag), true);
});
