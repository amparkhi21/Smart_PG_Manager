import mongoose from 'mongoose';
import PaymentClaim from '../models/PaymentClaim.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import Resident from '../models/Resident.js';
import Owner from '../models/Owner.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { appendPaymentAtomically, computeStatus, round2 } from '../utils/billing.js';
import { validUpiId } from '../utils/upi.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from '../utils/notifications.js';

const PENDING = 'Pending Verification', LOCK_MS = 60 * 1000;
export const VERIFY_WARNING = 'A UTR is only what the resident typed, not proof of payment. Confirm the money arrived in your own UPI/bank account before approving.';

const total = (type, bill) => (type === 'Rent' ? bill.amountDue : bill.amount);
const claimRequestId = (claim) => `claim-${claim._id}`;
const billStatus = (type, bill) => computeStatus(total(type, bill), bill.amountPaid, bill.dueDate);

// ---------- resident side ----------
const billScope = (type, resident) => (type === 'Rent'
  ? { Model: RentRecord, filter: { owner: resident.owner, resident: resident._id } }
  : { Model: ElectricityBill, filter: { owner: resident.owner, room: resident.room } });

async function pendingTotals(owner, billIds) {
  const rows = await PaymentClaim.aggregate([
    { $match: { owner, bill: { $in: billIds }, status: PENDING } },
    { $group: { _id: '$bill', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

const billView = (type, bill, pending) => {
  const pendingAmount = round2(pending?.amount || 0);
  return {
    id: bill._id, billType: type, month: bill.month, amountDue: total(type, bill), amountPaid: bill.amountPaid,
    balance: bill.balance, dueDate: bill.dueDate, status: billStatus(type, bill),
    pendingClaimAmount: pendingAmount, pendingClaims: pending?.count || 0,
    claimableAmount: Math.max(0, round2(bill.balance - pendingAmount)),
  };
};

export const listMyBills = asyncHandler(async (req, res) => {
  const resident = req.resident, data = [];
  for (const type of ['Rent', 'Electricity']) {
    const { Model, filter } = billScope(type, resident);
    const bills = await Model.find({ ...filter, balance: { $gt: 0 } }).sort({ dueDate: 1 }).lean();
    const pending = await pendingTotals(resident.owner, bills.map((bill) => bill._id));
    data.push(...bills.map((bill) => billView(type, bill, pending.get(String(bill._id)))));
  }
  data.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  res.json({ success: true, count: data.length, data });
});

// Read-only support for the resident UI. Financial writes remain in the Phase 5A claim APIs.
export const getMyPaymentDetails = asyncHandler(async (req, res) => {
  const owner = await Owner.findById(req.resident.owner).select('name pgName upiId').lean();
  if (!owner) throw new ApiError(401, 'Your PG account is no longer available');
  res.json({ success: true, data: { upiId: validUpiId(owner.upiId) ? owner.upiId : null, payeeName: owner.name, pgName: owner.pgName } });
});

export const listMyPaymentHistory = asyncHandler(async (req, res) => {
  const data = [];
  for (const type of ['Rent', 'Electricity']) {
    const { Model, filter } = billScope(type, req.resident);
    const bills = await Model.find({ ...filter, ...(req.query.month && { month: req.query.month }) }).sort({ month: -1 }).limit(100).lean();
    data.push(...bills.map((bill) => ({ ...billView(type, bill), sharedRoom: type === 'Electricity',
      // Electricity belongs to the whole room. Never expose another payer's references or invent a personal share.
      ...(type === 'Rent' && { payments: bill.payments.map((payment) => ({ id: payment._id, amount: payment.amount, method: payment.method, paidOn: payment.paidOn })) }),
    })));
  }
  res.json({ success: true, count: data.length, data });
});

const residentClaimView = (claim) => ({
  id: claim._id, billType: claim.billType, billId: claim.bill, month: claim.month, amount: claim.amount, utr: claim.utr,
  paymentDate: claim.paymentDate, status: claim.status, reviewNote: claim.reviewNote || null,
  reviewedAt: claim.reviewedAt || null, createdAt: claim.createdAt,
});

export const listMyClaims = asyncHandler(async (req, res) => {
  const filter = { owner: req.resident.owner, resident: req.resident._id };
  if (req.query.status) filter.status = req.query.status;
  const claims = await PaymentClaim.find(filter).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  res.json({ success: true, count: claims.length, data: claims.map(residentClaimView) });
});

export const submitClaim = asyncHandler(async (req, res) => {
  const resident = req.resident, { billType, billId, month } = req.body;
  const amount = round2(req.body.amount), utr = String(req.body.utr).trim().toUpperCase();
  const { Model, filter } = billScope(billType, resident);
  // The bill is always looked up inside the resident's own PG and own rent/room, never by client-supplied owner.
  const bill = await Model.findOne(billId ? { ...filter, _id: billId } : { ...filter, month });
  if (!bill) throw new ApiError(404, `${billType} bill not found`);
  if (bill.balance <= 0) throw new ApiError(409, 'This bill is already fully paid');
  const pending = (await pendingTotals(resident.owner, [bill._id])).get(String(bill._id));
  const claimable = Math.max(0, round2(bill.balance - (pending?.amount || 0)));
  if (amount > claimable) {
    throw new ApiError(400, claimable === 0
      ? 'Your pending payment claims already cover the full outstanding amount. Wait for your owner to verify them.'
      : `Amount is more than the claimable balance of ₹${claimable} for this bill`);
  }
  let claim;
  try {
    const id = new mongoose.Types.ObjectId();
    claim = await PaymentClaim.create({
      _id: id,
      owner: resident.owner, resident: resident._id, room: resident.room, billType, bill: bill._id, month: bill.month,
      amount, utr, paymentDate: new Date(`${req.body.paymentDate}T12:00:00+05:30`),
      notificationEvents: [notificationEvent('payment_claim_submitted', id, resident.owner, 'New payment claim',
        `${resident.fullName} submitted a ${billType.toLowerCase()} payment claim for ${bill.month}.`)],
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'A payment claim with this UTR has already been submitted');
    throw error;
  }
  await tryDeliverNotifications(claim.owner);
  res.status(201).json({
    success: true,
    message: 'Payment claim submitted. It stays Pending Verification and your bill will not change until your owner verifies and approves it.',
    data: residentClaimView(claim),
  });
});

// ---------- owner side ----------
async function ownerView(claims) {
  const byType = { Rent: [], Electricity: [] };
  claims.forEach((claim) => byType[claim.billType].push(claim.bill));
  const [rent, electricity] = await Promise.all([
    RentRecord.find({ _id: { $in: byType.Rent } }).select('amountDue amountPaid balance dueDate').lean(),
    ElectricityBill.find({ _id: { $in: byType.Electricity } }).select('amount amountPaid balance dueDate').lean(),
  ]);
  const bills = new Map([...rent.map((b) => [String(b._id), ['Rent', b]]), ...electricity.map((b) => [String(b._id), ['Electricity', b]])]);
  return claims.map((claim) => {
    const [type, bill] = bills.get(String(claim.bill)) || [];
    return {
      ...residentClaimView(claim), resident: { id: claim.resident?._id, name: claim.resident?.fullName }, room: claim.room?.roomNumber,
      bill: bill ? { amountDue: total(type, bill), amountPaid: bill.amountPaid, balance: bill.balance, status: billStatus(type, bill) } : null,
      verificationWarning: claim.status === PENDING ? VERIFY_WARNING : undefined,
    };
  });
}

export const listClaims = asyncHandler(async (req, res) => {
  const filter = { owner: req.owner._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.billType) filter.billType = req.query.billType;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const [claims, counts] = await Promise.all([
    PaymentClaim.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).populate('resident', 'fullName').populate('room', 'roomNumber').lean(),
    PaymentClaim.aggregate([{ $match: { owner: req.owner._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, count: claims.length, counts: Object.fromEntries(counts.map((row) => [row._id, row.count])), data: await ownerView(claims) });
});

const lockable = (stale) => [{ reviewLock: null }, { reviewLock: { $lt: stale } }];

async function explainUnavailable(owner, id) {
  const current = await PaymentClaim.findOne({ _id: id, owner }).select('status');
  if (!current) throw new ApiError(404, 'Payment claim not found');
  if (current.status !== PENDING) throw new ApiError(409, `This claim was already ${current.status.toLowerCase()}`);
  throw new ApiError(409, 'This claim is being reviewed right now. Refresh and try again.');
}

export const approveClaim = asyncHandler(async (req, res) => {
  const owner = req.owner._id, now = new Date();
  const claim = await PaymentClaim.findOneAndUpdate(
    { _id: req.params.id, owner, status: PENDING, $or: lockable(new Date(now - LOCK_MS)) }, { $set: { reviewLock: now } }, { new: true });
  if (!claim) return explainUnavailable(owner, req.params.id);
  const release = () => PaymentClaim.updateOne({ _id: claim._id, reviewLock: now }, { $set: { reviewLock: null } }).catch(() => {});
  try {
    const Model = claim.billType === 'Rent' ? RentRecord : ElectricityBill, requestId = claimRequestId(claim);
    // Idempotent: the claim ID is the payment requestId, so a retry can never record the money twice.
    const recorded = await appendPaymentAtomically(Model, owner, claim.bill, {
      amount: claim.amount, method: 'UPI', paidOn: claim.paymentDate, requestId,
      note: `UPI UTR ${claim.utr} (resident claim, owner verified)`,
    }) || await Model.findOne({ _id: claim.bill, owner, 'payments.requestId': requestId });
    if (!recorded) {
      await release();
      throw new ApiError(409, 'This claim can no longer be approved because the bill balance is now lower than the claimed amount. Reject it or record the payment manually.');
    }
    const approved = await PaymentClaim.findOneAndUpdate(
      { _id: claim._id, status: PENDING, reviewLock: now },
      { $set: { status: 'Approved', reviewedAt: new Date(), reviewLock: null, ...(req.body.note && { reviewNote: req.body.note }) },
        $push: { notificationEvents: notificationEvent('payment_approved', claim._id, claim.resident, 'Payment claim approved',
          `Your ${claim.billType.toLowerCase()} payment claim for ${claim.month} was approved by your PG owner.`) } }, { new: true });
    if (!approved) throw new ApiError(409, 'This claim changed while it was being approved. Refresh and check the bill.');
    await tryDeliverNotifications(approved.owner);
    res.json({ success: true, message: 'Claim approved and payment recorded', data: residentClaimView(approved) });
  } catch (error) { if (!(error instanceof ApiError)) await release(); throw error; }
});

export const rejectClaim = asyncHandler(async (req, res) => {
  const owner = req.owner._id, now = new Date();
  const target = await PaymentClaim.findOne({ _id: req.params.id, owner }).select('resident billType month');
  if (!target) return explainUnavailable(owner, req.params.id);
  const claim = await PaymentClaim.findOneAndUpdate(
    { _id: req.params.id, owner, status: PENDING, $or: lockable(new Date(now - LOCK_MS)) },
    { $set: { status: 'Rejected', reviewedAt: now, reviewLock: null, ...(req.body.reason && { reviewNote: req.body.reason }) },
      $push: { notificationEvents: notificationEvent('payment_rejected', target._id, target.resident, 'Payment claim rejected',
        `Your ${target.billType.toLowerCase()} payment claim for ${target.month} was rejected by your PG owner.`) } }, { new: true });
  if (!claim) return explainUnavailable(owner, req.params.id);
  await tryDeliverNotifications(claim.owner);
  res.json({ success: true, message: 'Claim rejected. The bill was not changed.', data: residentClaimView(claim) });
});
