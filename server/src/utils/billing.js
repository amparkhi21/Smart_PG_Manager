import ApiError from './ApiError.js';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Other'];
export const PAYMENT_STATUSES = ['Paid', 'Pending', 'Partially Paid', 'Overdue'];

// Shared by rent records and electricity bills
export function computeStatus(amountDue, amountPaid, dueDate) {
  if (amountPaid >= amountDue) return 'Paid';
  if (dueDate && new Date(dueDate) < new Date()) return 'Overdue';
  return amountPaid > 0 ? 'Partially Paid' : 'Pending';
}

// Statuses are stored, but time passing can make a record overdue without it being saved.
// Call this before listing or summarising so stored statuses are up to date.
export const refreshOverdue = (Model, ownerId) =>
  Model.updateMany(
    { owner: ownerId, balance: { $gt: 0 }, dueDate: { $lt: new Date() }, status: { $ne: 'Overdue' } },
    { $set: { status: 'Overdue' } }
  );

// The ONLY way payments are added: push a new entry. Existing entries are never edited or removed.
// The model's pre-validate hook then recalculates amountPaid, balance and status.
export function appendPayment(doc, { amount, method, paidOn, note }) {
  const value = round2(amount);
  if (value > doc.balance) {
    throw new ApiError(400, `Payment of ₹${value} is more than the pending balance of ₹${doc.balance}`);
  }
  if (doc.balance <= 0) throw new ApiError(409, 'This bill is already fully paid');
  doc.payments.push({ amount: value, method: method || 'Cash', paidOn: paidOn || new Date(), note });
}