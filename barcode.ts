export const hasValidGtinChecksum = (digits: string) => {
    if (!/^\d+$/.test(digits) || digits.length < 2) return false;
    const payload = digits.slice(0, -1).split('').reverse().map(Number);
    const sum = payload.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
};

export const normalizeBarcode = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const digits = value.replace(/\D/g, '');
    if (![8, 12, 13].includes(digits.length) || !hasValidGtinChecksum(digits)) return undefined;
    return digits;
};
