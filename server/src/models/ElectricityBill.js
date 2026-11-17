import mongoose from 'mongoose';
import { round2, computeStatus, PAYMENT_METHODS, PAYMENT_STATUSES } from '../utils/billing.js';

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: [1, 'Payment must be at least 1'] },
  paidOn: { type: Date, default: Date.now },
  method: { type: String, enum: PAYMENT_METHODS, default: 'Cash' },
  note: { type: String, trim: true },
  requestId: { type: String, trim: true, maxlength: 36 },
});

const electricityBillSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    month: { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
    previousReading: { type: Number, required: true, min: 0 },
    currentReading: { type: Number, required: true, min: 0 },
    ratePerUnit: { type: Number, required: true, min: 0 },
    units: { type: Number, default: 0 }, // calculated
    amount: { type: Number, default: 0 }, // calculated: units x ratePerUnit
    dueDate: { type: Date, required: true },
    payments: [paymentSchema],
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'Pending' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

electricityBillSchema.index({ room: 1, month: 1 }, { unique: true });
electricityBillSchema.index({ owner: 1, month: 1 });

electricityBillSchema.pre('validate', function () {
  if (this.currentReading < this.previousReading) {
    this.invalidate('currentReading', 'Current reading cannot be less than the previous reading');
    return;
  }
  this.units = this.currentReading - this.previousReading;
  this.amount = round2(this.units * this.ratePerUnit);

  const paid = round2(this.payments.reduce((sum, p) => sum + p.amount, 0));
  if (paid > this.amount) this.invalidate('payments', 'Total payments exceed the bill amount');
  this.amountPaid = paid;
  this.balance = round2(this.amount - paid);
  this.status = computeStatus(this.amount, paid, this.dueDate);
});

export default mongoose.model('ElectricityBill', electricityBillSchema);