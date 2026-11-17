import RentRecord from '../models/RentRecord.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { findOwned } from '../utils/ownership.js';
import { refreshOverdue, appendPaymentAtomically, round2 } from '../utils/billing.js';
import { currentMonthIST, dueDateFor, monthEndIST } from '../utils/dates.js';

const POPULATE = [
  { path: 'resident', select: 'fullName phone status' },
  { path: 'room', select: 'roomNumber' },
];

// Creates a rent record for every active resident who has no record for that month yet.
// Running it twice never creates duplicates (and the DB has a unique index as a second safety net).
export const generateRent = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const month = req.body.month || currentMonthIST();
  const dueDate = dueDateFor(month, req.owner.rentDueDay);

  const residents = await Resident.find({ owner: ownerId, status: 'Active', joiningDate: { $lte: monthEndIST(month) } });
  const existing = await RentRecord.find({ owner: ownerId, month }).select('resident');
  const have = new Set(existing.map((e) => String(e.resident)));

  const toCreate = residents
    .filter((r) => !have.has(String(r._id)))
    .map((r) => ({ owner: ownerId, resident: r._id, room: r.room, month, amountDue: r.monthlyRent, dueDate }));
  if (toCreate.length) await RentRecord.create(toCreate);

  const skipped = residents.length - toCreate.length;
  res.status(201).json({
    success: true,
    message: `${toCreate.length} rent record(s) created for ${month}, ${skipped} already existed`,
    data: { month, created: toCreate.length, skipped },
  });
});

export const listRent = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const { month, room, resident, status } = req.query;
  await refreshOverdue(RentRecord, ownerId);

  const filter = { owner: ownerId };
  if (month) filter.month = month;
  if (room) filter.room = room;
  if (resident) filter.resident = resident;
  if (status) filter.status = status;

  const data = await RentRecord.find(filter).populate(POPULATE).sort({ month: -1, createdAt: 1 });
  const totals = data.reduce(
    (t, r) => ({ due: t.due + r.amountDue, paid: t.paid + r.amountPaid, balance: t.balance + r.balance }),
    { due: 0, paid: 0, balance: 0 }
  );
  res.json({
    success: true,
    count: data.length,
    totals: { due: round2(totals.due), paid: round2(totals.paid), balance: round2(totals.balance) },
    data,
  });
});

export const getRent = asyncHandler(async (req, res) => {
  const record = await findOwned(RentRecord, req.params.id, req, POPULATE);
  res.json({ success: true, data: record });
});

// Append-only: there is intentionally no endpoint to edit or delete a payment.
export const addRentPayment = asyncHandler(async (req, res) => {
  const record = await appendPaymentAtomically(RentRecord, req.owner._id, req.params.id, req.body);
  if (!record) {
    const current = await findOwned(RentRecord, req.params.id, req);
    if (req.body.requestId && current.payments.some((payment) => payment.requestId === req.body.requestId)) {
      await current.populate(POPULATE);
      return res.json({ success: true, message: 'This payment was already recorded', data: current });
    }
    if (current.balance <= 0) throw new ApiError(409, 'This bill is already fully paid');
    throw new ApiError(400, `Payment of ₹${round2(req.body.amount)} is more than the pending balance of ₹${current.balance}`);
  }
  await record.populate(POPULATE);
  res.status(201).json({
    success: true,
    message: record.balance === 0 ? 'Rent fully paid' : `Payment recorded. ₹${record.balance} still pending`,
    data: record,
  });
});