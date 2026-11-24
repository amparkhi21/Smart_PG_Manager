import RentRecord from '../models/RentRecord.js';
import Attendance from '../models/Attendance.js';
import EmergencyContact from '../models/EmergencyContact.js';
import asyncHandler from '../utils/asyncHandler.js';
import { publicResident } from '../utils/residentAuth.js';
import { todayIST, currentMonthIST, dateInputIST } from '../utils/dates.js';
import { computeStatus, round2 } from '../utils/billing.js';

const profile = (req) => ({
  ...publicResident(req.resident, req.residentOwner, req.residentRoom),
  monthlyRent: req.resident.monthlyRent,
  ownerPhone: req.residentOwner.phone || '',
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
    Attendance.find({ ...scope, date: { $gte: [dateInputIST(req.resident.joiningDate), `${month}-01`].sort().at(-1), $lte: today } })
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
  const resident = profile(req);
  if (!resident.ownerPhone) {
    const contact = await EmergencyContact.findOne({ owner: req.resident.owner, category: 'PG Owner' })
      .sort({ priority: -1, name: 1, _id: 1 }).select('phone').lean();
    resident.ownerPhone = contact?.phone || '';
  }
  res.json({ success: true, data: { role: 'resident', resident } });
});

export const getResidentAttendance = asyncHandler(async (req, res) => {
  const month = req.query.month || currentMonthIST();
  const joiningDate = dateInputIST(req.resident.joiningDate);
  const fromDate = [joiningDate, `${month}-01`].sort().at(-1);
  const throughDate = todayIST();
  // Both scope identifiers come from protectResident, including when a caller
  // supplies another resident/owner in the query. Historical rooms stay included.
  const records = await Attendance.find({
    owner: req.resident.owner, resident: req.resident._id,
    date: { $gte: fromDate, $lte: throughDate < `${month}-31` ? throughDate : `${month}-31` },
  }).select('date status note -_id').sort({ date: 1 }).lean();
  const summary = { Present: 0, Absent: 0, 'On Leave': 0 };
  for (const record of records) summary[record.status] += 1;
  const recordedDays = summary.Present + summary.Absent;
  res.json({ success: true, data: {
    month, joiningDate, fromDate, throughDate, records,
    summary: { ...summary, recordedDays, percentage: recordedDays ? Math.round(summary.Present / recordedDays * 10000) / 100 : null },
  } });
});
