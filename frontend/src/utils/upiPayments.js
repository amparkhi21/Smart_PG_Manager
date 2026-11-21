export const CLAIM_STATUSES = ['Pending Verification', 'Approved', 'Rejected'];
export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;
export const validUpiId = (value) => typeof value === 'string' && UPI_ID_RE.test(value.trim());

export function paymentAmountError(value, available) {
  if (!Number.isFinite(Number(available)) || Number(available) < 0) return 'Bill balance is unavailable. Refresh the bill before paying.';
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0 || !Number.isFinite(Number(value))) return 'Enter a payment amount greater than zero, with at most two decimal places.';
  if (Math.round(Number(value) * 100) > Math.round(Number(available) * 100)) return 'Amount exceeds the available balance after pending claims.';
  return '';
}
export function claimErrors({ amount, utr, paymentDate }, available, today) {
  const errors = {};
  const invalid = paymentAmountError(amount, available); if (invalid) errors.amount = invalid;
  if (!/^[A-Za-z0-9]{8,22}$/.test(utr.trim())) errors.utr = 'Enter the actual UPI reference: 8 to 22 letters or digits.';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && new Date(`${paymentDate}T00:00:00Z`);
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDate || paymentDate > today) errors.paymentDate = 'Choose a real payment date, today or earlier (IST).';
  return errors;
}
export function upiIntent({ upiId, payeeName, amount, available, bill }) {
  if (!validUpiId(upiId) || !payeeName?.trim() || !bill?.id || paymentAmountError(amount, available)) return null;
  // tr is the actual bill identifier, never a fabricated bank transaction reference/UTR.
  const values = { pa: upiId.trim(), pn: payeeName.trim(), am: Number(amount).toFixed(2), cu: 'INR', tr: bill.id, tn: `${bill.billType} ${bill.month}` };
  return 'upi://pay?' + Object.entries(values).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
