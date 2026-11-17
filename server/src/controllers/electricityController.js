import ElectricityBill from '../models/ElectricityBill.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { findOwned } from '../utils/ownership.js';
import { refreshOverdue, appendPaymentAtomically, round2 } from '../utils/billing.js';
import { dueDateFor } from '../utils/dates.js';

const POPULATE = [{ path: 'room', select: 'roomNumber' }];

// Helps the form: the previous reading is the room's last bill's current reading
export const getPrefill = asyncHandler(async (req, res) => {
  const room = await findOwned(Room, req.params.roomId, req);
  const last = await ElectricityBill.findOne({ owner: req.owner._id, room: room._id }).sort({ month: -1 });
  res.json({
    success: true,
    data: {
      room: { _id: room._id, roomNumber: room.roomNumber },
      previousReading: last ? last.currentReading : room.lastMeterReading,
      lastBillMonth: last ? last.month : null,
      ratePerUnit: req.owner.defaultElectricityRate,
    },
  });
});

export const createBill = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const { month, currentReading } = req.body;
  const room = await findOwned(Room, req.body.room, req);

  if (await ElectricityBill.exists({ owner: ownerId, room: room._id, month })) {
    throw new ApiError(409, `An electricity bill for room ${room.roomNumber} already exists for ${month}`);
  }
  if (await ElectricityBill.exists({ owner: ownerId, room: room._id, month: { $gt: month } })) {
    throw new ApiError(409, 'A later bill already exists for this room. Enter readings in month order.');
  }

  // Readings must form an unbroken chain: previous reading = last bill's current reading
  const lastBill = await ElectricityBill.findOne({ owner: ownerId, room: room._id, month: { $lt: month } }).sort({ month: -1 });
  const expectedPrevious = lastBill ? lastBill.currentReading : room.lastMeterReading;
  let previousReading = req.body.previousReading ?? expectedPrevious;
  if (lastBill && previousReading !== lastBill.currentReading) {
    throw new ApiError(400, `Previous reading must match last month's current reading (${lastBill.currentReading})`);
  }
  if (currentReading < previousReading) {
    throw new ApiError(400, `Current reading (${currentReading}) cannot be less than the previous reading (${previousReading})`);
  }

  // Units and amount are calculated by the model, never trusted from the client
  const bill = await ElectricityBill.create({
    owner: ownerId,
    room: room._id,
    month,
    previousReading,
    currentReading,
    ratePerUnit: req.body.ratePerUnit ?? req.owner.defaultElectricityRate,
    dueDate: dueDateFor(month, req.owner.rentDueDay),
  });

  await Room.updateOne({ _id: room._id, owner: ownerId }, { $set: { lastMeterReading: currentReading } });
  await bill.populate(POPULATE);
  res.status(201).json({
    success: true,
    message: `Room ${room.roomNumber}: ${bill.units} units × ₹${bill.ratePerUnit} = ₹${bill.amount}`,
    data: bill,
  });
});

export const listBills = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const { month, room, status } = req.query;
  await refreshOverdue(ElectricityBill, ownerId);

  const filter = { owner: ownerId };
  if (month) filter.month = month;
  if (room) filter.room = room;
  if (status) filter.status = status;

  const data = await ElectricityBill.find(filter).populate(POPULATE).sort({ month: -1, createdAt: 1 });
  const totals = data.reduce(
    (t, b) => ({ billed: t.billed + b.amount, paid: t.paid + b.amountPaid, balance: t.balance + b.balance }),
    { billed: 0, paid: 0, balance: 0 }
  );
  res.json({
    success: true,
    count: data.length,
    totals: { billed: round2(totals.billed), paid: round2(totals.paid), balance: round2(totals.balance) },
    data,
  });
});

export const getBill = asyncHandler(async (req, res) => {
  const bill = await findOwned(ElectricityBill, req.params.id, req, POPULATE);
  res.json({ success: true, data: bill });
});

export const addBillPayment = asyncHandler(async (req, res) => {
  const bill = await appendPaymentAtomically(ElectricityBill, req.owner._id, req.params.id, req.body);
  if (!bill) {
    const current = await findOwned(ElectricityBill, req.params.id, req);
    if (req.body.requestId && current.payments.some((payment) => payment.requestId === req.body.requestId)) {
      await current.populate(POPULATE);
      return res.json({ success: true, message: 'This payment was already recorded', data: current });
    }
    if (current.balance <= 0) throw new ApiError(409, 'This bill is already fully paid');
    throw new ApiError(400, `Payment of ₹${round2(req.body.amount)} is more than the pending balance of ₹${current.balance}`);
  }
  await bill.populate(POPULATE);
  res.status(201).json({
    success: true,
    message: bill.balance === 0 ? 'Electricity bill fully paid' : `Payment recorded. ₹${bill.balance} still pending`,
    data: bill,
  });
});