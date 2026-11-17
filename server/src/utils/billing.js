import mongoose from 'mongoose';

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

// A conditional pipeline update makes balance validation and installment append atomic.
export function appendPaymentAtomically(Model, ownerId, recordId, { amount, method, paidOn, note, requestId }) {
  const value = round2(amount);
  const payment = {
    _id: new mongoose.Types.ObjectId(),
    amount: value,
    method: method || 'Cash',
    paidOn: paidOn ? new Date(paidOn) : new Date(),
  };
  if (note) payment.note = note;
  if (requestId) payment.requestId = requestId;
  const now = new Date();

  return Model.findOneAndUpdate(
    {
      _id: recordId,
      owner: ownerId,
      balance: { $gte: value, $gt: 0 },
      ...(requestId ? { 'payments.requestId': { $ne: requestId } } : {}),
    },
    [{
      $set: {
        payments: { $concatArrays: [{ $ifNull: ['$payments', []] }, { $literal: [payment] }] },
        amountPaid: { $round: [{ $add: [{ $ifNull: ['$amountPaid', 0] }, value] }, 2] },
        balance: { $round: [{ $subtract: ['$balance', value] }, 2] },
        status: {
          $cond: [
            { $lte: [{ $subtract: ['$balance', value] }, 0] },
            'Paid',
            { $cond: [{ $lt: ['$dueDate', now] }, 'Overdue', 'Partially Paid'] },
          ],
        },
      },
    }],
    { new: true }
  );
}
