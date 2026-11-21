import RentRecord from '../models/RentRecord.js';
import Attendance from '../models/Attendance.js';
import asyncHandler from '../utils/asyncHandler.js';
import { publicResident } from '../utils/residentAuth.js';
import { todayIST } from '../utils/dates.js';
import { computeStatus, round2 } from '../utils/billing.js';

const profile = (req) => ({
  ...publicResident(req.resident, req.residentOwner, req.residentRoom),
  monthlyRent: req.resident.monthlyRent,
});

export const getResidentDashboard = asyncHandler(async (req, res) => {
  const today = todayIST();
  const month = today.slice(0, 7);
  // Both identifiers come from the checked session, never query/body parameters.
  // Historical records follow the resident across room reassignments.
  const scope = { owner: req.resident.owner, resident: req.resident._id };
  const [rent, attendanceRecords] = await Promise.all([
    RentRecord.find({ ...scope, $or: [{ month }, { balance: { $gt: 0 } }] })
      .select('month amountDue amountPaid balance dueDate -_id').sort({ dueDate: 1 }).lean(),
    Attendance.find({ ...scope, date: { $gte: `${month}-01`, $lte: today } })
      .select('status -_id').lean(),
  ]);
  const unpaid = rent.filter((record) => record.balance > 0);
  const currentBill = rent.find((record) => record.month === month);
  const counts = { Present: 0, Absent: 0, 'On Leave': 0 };
  attendanceRecords.forEach((record) => { if (Object.hasOwn(counts, record.status)) counts[record.status] += 1; });

  res.json({ success: true, data: {
    role: 'resident', resident: profile(req),
    finance: {
      month, monthlyRent: req.resident.monthlyRent,
      pendingDues: round2(unpaid.reduce((total, record) => total + record.balance, 0)),
      paymentDueDate: unpaid.find((record) => record.dueDate)?.dueDate || null,
      currentBill: currentBill ? {
        amountDue: currentBill.amountDue, amountPaid: currentBill.amountPaid,
        balance: currentBill.balance, dueDate: currentBill.dueDate,
        status: computeStatus(currentBill.amountDue, currentBill.amountPaid, currentBill.dueDate),
      } : null,
    },
    attendance: { month, throughDate: today, ...counts, recordedDays: attendanceRecords.length },
  } });
});

export const getResidentOwnProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { role: 'resident', resident: profile(req) } });
});
