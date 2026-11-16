import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import Attendance from '../models/Attendance.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { findOwned, escapeRegex } from '../utils/ownership.js';
import { refreshOverdue, round2 } from '../utils/billing.js';
import { currentMonthIST } from '../utils/dates.js';

// Capacity check. (For a single-owner app this is safe; two simultaneous requests
// adding to the last free bed could theoretically both pass.)
async function assertCapacity(ownerId, room, excludeResidentId) {
  const filter = { owner: ownerId, room: room._id, status: 'Active' };
  if (excludeResidentId) filter._id = { $ne: excludeResidentId };
  const active = await Resident.countDocuments(filter);
  if (active >= room.capacity) {
    throw new ApiError(409, `Room ${room.roomNumber} is full (${active}/${room.capacity} beds taken)`);
  }
}

export const listResidents = asyncHandler(async (req, res) => {
  const { status, search, room } = req.query;
  const filter = { owner: req.owner._id };
  if (status) filter.status = status;
  if (room) filter.room = room;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { phone: rx }];
  }
  const residents = await Resident.find(filter).populate('room', 'roomNumber').sort({ fullName: 1 });
  res.json({ success: true, count: residents.length, data: residents });
});

export const getResident = asyncHandler(async (req, res) => {
  const resident = await findOwned(Resident, req.params.id, req, { path: 'room', select: 'roomNumber' });
  res.json({ success: true, data: resident });
});

// Full profile: rent history, the room's electricity bills, and a month of attendance
export const getResidentProfile = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const resident = await findOwned(Resident, req.params.id, req, { path: 'room', select: 'roomNumber monthlyRent' });
  const month = req.query.month || currentMonthIST();
  await refreshOverdue(RentRecord, ownerId);

  const [rentRecords, electricityBills, attendance] = await Promise.all([
    RentRecord.find({ owner: ownerId, resident: resident._id }).sort({ month: -1 }),
    // Electricity is billed per room, so roommates share the same bills
    ElectricityBill.find({ owner: ownerId, room: resident.room._id }).sort({ month: -1 }).limit(12),
    Attendance.find({ owner: ownerId, resident: resident._id, date: { $gte: `${month}-01`, $lte: `${month}-31` } }).sort({ date: 1 }),
  ]);

  const attendanceSummary = { Present: 0, Absent: 0, 'On Leave': 0 };
  attendance.forEach((a) => { attendanceSummary[a.status] += 1; });
  const rentPending = round2(rentRecords.reduce((s, r) => s + r.balance, 0));

  res.json({
    success: true,
    data: { resident, rentRecords, rentPending, electricityBills, attendance: { month, summary: attendanceSummary, records: attendance } },
  });
});

export const createResident = asyncHandler(async (req, res) => {
  const { fullName, phone, email, joiningDate, monthlyRent, emergencyContact } = req.body;
  const room = await findOwned(Room, req.body.room, req);
  await assertCapacity(req.owner._id, room);

  const resident = await Resident.create({
    owner: req.owner._id,
    room: room._id,
    fullName,
    phone,
    email,
    joiningDate,
    monthlyRent: monthlyRent ?? room.monthlyRent, // defaults to the room's rent
    emergencyContact,
  });
  res.status(201).json({ success: true, message: `${resident.fullName} added to room ${room.roomNumber}`, data: resident });
});

export const updateResident = asyncHandler(async (req, res) => {
  const resident = await findOwned(Resident, req.params.id, req);
  if (resident.status === 'Left') throw new ApiError(409, 'This resident has left and can no longer be edited');

  if (req.body.room && String(req.body.room) !== String(resident.room)) {
    const newRoom = await findOwned(Room, req.body.room, req);
    await assertCapacity(req.owner._id, newRoom, resident._id);
    resident.room = newRoom._id; // old rent records keep their original room
  }
  ['fullName', 'phone', 'email', 'joiningDate', 'monthlyRent', 'emergencyContact'].forEach((k) => {
    if (req.body[k] !== undefined) resident[k] = req.body[k];
  });
  await resident.save();
  res.json({ success: true, message: 'Resident updated', data: resident });
});

// Marks the resident as Left. All history (rent, attendance) is kept.
export const markResidentLeft = asyncHandler(async (req, res) => {
  const resident = await findOwned(Resident, req.params.id, req);
  if (resident.status === 'Left') throw new ApiError(409, 'Resident is already marked as left');

  resident.status = 'Left';
  resident.leftDate = req.body.leftDate || new Date();
  await resident.save();

  const unpaid = await RentRecord.find({ owner: req.owner._id, resident: resident._id, balance: { $gt: 0 } });
  const pendingRent = round2(unpaid.reduce((s, r) => s + r.balance, 0));
  res.json({
    success: true,
    message: pendingRent > 0 ? `${resident.fullName} marked as left. ₹${pendingRent} rent is still pending.` : `${resident.fullName} marked as left`,
    data: { resident, pendingRent },
  });
});

// Hard delete is only allowed for residents with no history (e.g. added by mistake)
export const deleteResident = asyncHandler(async (req, res) => {
  const resident = await findOwned(Resident, req.params.id, req);
  const base = { owner: req.owner._id, resident: resident._id };
  const [hasRent, hasAttendance] = await Promise.all([RentRecord.exists(base), Attendance.exists(base)]);
  if (hasRent || hasAttendance) {
    throw new ApiError(409, 'This resident has rent or attendance history. Mark them as left instead of deleting.');
  }
  await resident.deleteOne();
  res.json({ success: true, message: 'Resident deleted' });
});