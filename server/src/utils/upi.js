import { UPI_ID_RE } from '../constants.js';

export const validUpiId = (value) => typeof value === 'string' && UPI_ID_RE.test(value);
