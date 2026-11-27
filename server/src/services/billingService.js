import mongoose from 'mongoose';
import { round2 } from '../utils/billing.js';

// Refresh stored statuses before listing or summarising time-dependent balances.
export const refreshOverdue = (Model, ownerId) =>
  Model.updateMany(
    { owner: ownerId, balance: { $gt: 0 }, dueDate: { $lt: new Date() }, status: { $ne: 'Overdue' } },
    { $set: { status: 'Overdue' } }
  );

// Keep balance validation, retry-ID checks and installment append in one update.
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
