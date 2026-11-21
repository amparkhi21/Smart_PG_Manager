export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;
export const validUpiId = (value) => typeof value === 'string' && UPI_ID_RE.test(value);
