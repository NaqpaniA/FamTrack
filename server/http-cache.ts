import { createHash } from 'node:crypto';

export const familyRevisionEtag = (familyId: string, revision: number) => {
    const familyKey = createHash('sha256').update(familyId).digest('hex').slice(0, 12);
    return `"famtrack-${familyKey}-r${Math.max(0, Math.trunc(revision))}"`;
};

export const requestEtagMatches = (ifNoneMatch: string | undefined, etag: string) => {
    if (!ifNoneMatch) return false;
    return ifNoneMatch
        .split(',')
        .map(value => value.trim().replace(/^W\//, ''))
        .some(value => value === '*' || value === etag);
};
