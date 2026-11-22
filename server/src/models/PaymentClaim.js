import mongoose from 'mongoose';
import { notificationOutbox } from './notificationOutbox.js';

export const CLAIM_STATUSES = ['Pending Verification', 'Approved', 'Rejected', 'Cancelled'];
export const BILL_TYPES = ['Rent', 'Electricity'];

// A resident's *claim* that they paid. It is never proof of payment and changes no balance until
// the owner approves it; approval records the payment through the existing atomic payment logic.
const paymentClaimSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, immutable: true },
  billType: { type: String, enum: BILL_TYPES, required: true, immutable: true },
  bill: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  month: { type: String, required: true, immutable: true },
  amount: { type: Number, required: true, min: 0.01, immutable: true },
  utr: { type: String, required: true, trim: true, uppercase: true, minlength: 8, maxlength: 22, immutable: true },
  paymentDate: { type: Date, required: true, immutable: true },
  status: { type: String, enum: CLAIM_STATUSES, default: 'Pending Verification' },
  reviewNote: { type: String, trim: true, maxlength: 500 },
  reviewedAt: { type: Date },
  // Short-lived review lock so concurrent approve/reject requests cannot both act on one claim.
  reviewLock: { type: Date, default: null },
}, { timestamps: true });

paymentClaimSchema.index({ owner: 1, status: 1, createdAt: -1 });
paymentClaimSchema.index({ resident: 1, createdAt: -1 });
paymentClaimSchema.index({ bill: 1, status: 1 });
paymentClaimSchema.plugin(notificationOutbox);
// One live claim per UTR within a PG. Rejected claims release the UTR so a corrected claim can be resubmitted.
paymentClaimSchema.index({ owner: 1, utr: 1 }, {
  unique: true, name: 'payment_claim_active_utr_per_pg',
  partialFilterExpression: { status: { $in: ['Pending Verification', 'Approved'] } },
});

export default mongoose.model('PaymentClaim', paymentClaimSchema);
