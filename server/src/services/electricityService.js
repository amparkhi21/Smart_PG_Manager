import ElectricityBill from '../models/ElectricityBill.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';

import { findOwned } from '../utils/ownership.js';
import { refreshOverdue, appendPaymentAtomically } from './billingService.js';
import { round2 } from '../utils/billing.js';
import { dueDateFor } from '../utils/dates.js';

const POPULATE = [{ path: 'room', select: 'roomNumber' }];

// Helps the form: the previous reading is the room's last bill's current reading
export const getPrefill = async (context) => {
  const room = await findOwned(Room, context.identifiers.roomId, context);
  const last = await ElectricityBill.findOne({ owner: context.owner._id, room: room._id }).sort({ month: -1 });
  return {
    data: {
      room: { _id: room._id, roomNumber: room.roomNumber },
      previousReading: last ? last.currentReading : room.lastMeterReading,
      lastBillMonth: last ? last.month : null,
      ratePerUnit: context.owner.defaultElectricityRate,
    },
  };
};

export const createBill = async (context) => {
  const ownerId = context.owner._id;
  const { month, currentReading } = context.input;
  const room = await findOwned(Room, context.input.room, context);

  if (await ElectricityBill.exists({ owner: ownerId, room: room._id, month })) {
    throw new ApiError(409, `An electricity bill for room ${room.roomNumber} already exists for ${month}`);
  }
  if (await ElectricityBill.exists({ owner: ownerId, room: room._id, month: { $gt: month } })) {
    throw new ApiError(409, 'A later bill already exists for this room. Enter readings in month order.');
  }

  // Readings must form an unbroken chain: previous reading = last bill's current reading
  const lastBill = await ElectricityBill.findOne({ owner: ownerId, room: room._id, month: { $lt: month } }).sort({ month: -1 });
  const expectedPrevious = lastBill ? lastBill.currentReading : room.lastMeterReading;
  let previousReading = context.input.previousReading ?? expectedPrevious;
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
    ratePerUnit: context.input.ratePerUnit ?? context.owner.defaultElectricityRate,
    dueDate: dueDateFor(month, context.owner.rentDueDay),
  });

  await Room.updateOne({ _id: room._id, owner: ownerId }, { $set: { lastMeterReading: currentReading } });
  await bill.populate(POPULATE);
  return {
    message: `Room ${room.roomNumber}: ${bill.units} units × ₹${bill.ratePerUnit} = ₹${bill.amount}`,
    data: bill,
  };
};

export const listBills = async (context) => {
  const ownerId = context.owner._id;
  const { month, room, status } = context.filters;
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
  return {
    count: data.length,
    totals: { billed: round2(totals.billed), paid: round2(totals.paid), balance: round2(totals.balance) },
    data,
  };
};

export const getBill = async (context) => {
  const bill = await findOwned(ElectricityBill, context.identifiers.id, context, POPULATE);
  return { data: bill };
};

export const addBillPayment = async (context) => {
  const bill = await appendPaymentAtomically(ElectricityBill, context.owner._id, context.identifiers.id, context.input);
  if (!bill) {
    const current = await findOwned(ElectricityBill, context.identifiers.id, context);
    if (context.input.requestId && current.payments.some((payment) => payment.requestId === context.input.requestId)) {
      await current.populate(POPULATE);
      return { created: false, ...{ message: 'This payment was already recorded', data: current } };
    }
    if (current.balance <= 0) throw new ApiError(409, 'This bill is already fully paid');
    throw new ApiError(400, `Payment of ₹${round2(context.input.amount)} is more than the pending balance of ₹${current.balance}`);
  }
  await bill.populate(POPULATE);
  return { created: true, ...{
    message: bill.balance === 0 ? 'Electricity bill fully paid' : `Payment recorded. ₹${bill.balance} still pending`,
    data: bill,
  } };
};