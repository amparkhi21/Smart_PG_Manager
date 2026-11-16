import mongoose from 'mongoose';
import { round2, computeStatus, PAYMENT_METHODS, PAYMENT_STATUSES } from '../utils/billing.js';

// Each payment is its own sub-document. Payments are only ever appended,
// never edited or overwritten, so history is always preserved.
const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: [1, 'Payment must be at least 1'] },
  paidOn: { type: Date, default: Date.now },
  method: { type: String, enum: PAYMENT_METHODS, default: 'Cash' },
  note: { type: String, trim: true },
});

const rentRecordSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    month: { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
    amountDue: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    payments: [paymentSchema],
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'Pending' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rentRecordSchema.index({ resident: 1, month: 1 }, { unique: true });
rentRecordSchema.index({ owner: 1, month: 1 });

rentRecordSchema.pre('validate', function () {
  const paid = round2(this.payments.reduce((sum, p) => sum + p.amount, 0));
  if (paid > this.amountDue) this.invalidate('payments', 'Total payments exceed the rent due');
  this.amountPaid = paid;
  this.balance = round2(this.amountDue - paid);
  this.status = computeStatus(this.amountDue, paid, this.dueDate);
});

export default mongoose.model('RentRecord', rentRecordSchema);