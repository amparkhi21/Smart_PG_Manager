import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import asyncHandler from '../utils/asyncHandler.js';
import { refreshOverdue, round2 } from '../utils/billing.js';
import { currentMonthIST } from '../utils/dates.js';

const sumTotals = async (Model, match, dueField) => {
  const [r] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, billed: { $sum: `$${dueField}` }, collected: { $sum: '$amountPaid' }, pending: { $sum: '$balance' } } },
  ]);
  return { billed: round2(r?.billed || 0), collected: round2(r?.collected || 0), pending: round2(r?.pending || 0) };
};

const recentPaymentsOf = async (Model, ownerId, type, populate) => {
  const rows = await Model.aggregate([
    { $match: { owner: ownerId } },
    { $unwind: '$payments' },
    { $sort: { 'payments.paidOn': -1 } },
    { $limit: 10 },
    { $project: { _id: 0, recordId: '$_id', resident: 1, room: 1, month: 1, amount: '$payments.amount', method: '$payments.method', paidOn: '$payments.paidOn' } },
  ]);
  await Model.populate(rows, populate);
  return rows.map((r) => ({ ...r, type }));
};

export const getDashboard = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const month = req.query.month || currentMonthIST();
  const now = new Date();

  await Promise.all([refreshOverdue(RentRecord, ownerId), refreshOverdue(ElectricityBill, ownerId)]);

  const [
    totalRooms, activeResidents, occupiedRoomIds,
    rentMonth, elecMonth, rentOutstanding, elecOutstanding,
    rentPayments, elecPayments, pendingRent, upcomingRent, upcomingElec,
  ] = await Promise.all([
    Room.countDocuments({ owner: ownerId }),
    Resident.countDocuments({ owner: ownerId, status: 'Active' }),
    Resident.distinct('room', { owner: ownerId, status: 'Active' }),
    sumTotals(RentRecord, { owner: ownerId, month }, 'amountDue'),
    sumTotals(ElectricityBill, { owner: ownerId, month }, 'amount'),
    sumTotals(RentRecord, { owner: ownerId, balance: { $gt: 0 } }, 'amountDue'),
    sumTotals(ElectricityBill, { owner: ownerId, balance: { $gt: 0 } }, 'amount'),
    recentPaymentsOf(RentRecord, ownerId, 'rent', [{ path: 'resident', select: 'fullName' }, { path: 'room', select: 'roomNumber' }]),
    recentPaymentsOf(ElectricityBill, ownerId, 'electricity', [{ path: 'room', select: 'roomNumber' }]),
    RentRecord.find({ owner: ownerId, balance: { $gt: 0 } })
      .sort({ dueDate: 1 }).limit(10)
      .select('resident room month balance dueDate status')
      .populate([{ path: 'resident', select: 'fullName phone' }, { path: 'room', select: 'roomNumber' }]),
    RentRecord.find({ owner: ownerId, balance: { $gt: 0 }, dueDate: { $gte: now } })
      .sort({ dueDate: 1 }).limit(10)
      .select('resident room month balance dueDate')
      .populate([{ path: 'resident', select: 'fullName' }, { path: 'room', select: 'roomNumber' }]).lean(),
    ElectricityBill.find({ owner: ownerId, balance: { $gt: 0 }, dueDate: { $gte: now } })
      .sort({ dueDate: 1 }).limit(10)
      .select('room month balance dueDate')
      .populate({ path: 'room', select: 'roomNumber' }).lean(),
  ]);

  const occupiedRooms = occupiedRoomIds.length;
  const upcomingDeadlines = [
    ...upcomingRent.map((r) => ({ ...r, type: 'rent' })),
    ...upcomingElec.map((b) => ({ ...b, type: 'electricity' })),
  ]
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 10);

  res.json({
    success: true,
    data: {
      month,
      rooms: { total: totalRooms, occupied: occupiedRooms, vacant: totalRooms - occupiedRooms },
      residents: { active: activeResidents },
      // This month's billing
      rent: { billed: rentMonth.billed, collected: rentMonth.collected, pending: rentMonth.pending },
      electricity: { billed: elecMonth.billed, collected: elecMonth.collected, pending: elecMonth.pending },
      // Unpaid across ALL months
      outstanding: {
        rent: rentOutstanding.pending,
        electricity: elecOutstanding.pending,
        total: round2(rentOutstanding.pending + elecOutstanding.pending),
      },
      recentPayments: [...rentPayments, ...elecPayments]
        .sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn))
        .slice(0, 10),
      pendingRent,
      upcomingDeadlines,
    },
  });
});