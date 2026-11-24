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
import { applyLoginAccess } from '../utils/residentAuth.js';
import { withOccupancyTransaction } from '../utils/occupancyTransaction.js';
import { assertBedAvailable, resolveBedNumber, setResidentBed } from '../utils/residentBeds.js';

async function assertCapacity(ownerId, room, excludeResidentId, session) {
  const filter = { owner: ownerId, room: room._id, status: 'Active' };
  if (excludeResidentId) filter._id = { $ne: excludeResidentId };
  const active = await Resident.countDocuments(filter).session(session);
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
  const { resident, room } = await withOccupancyTransaction(req.owner._id, async (session) => {
  const room = await findOwned(Room, req.body.room, req, undefined, session);
  await assertCapacity(req.owner._id, room, undefined, session);
  const bedNumber = resolveBedNumber(room, req.body.bedNumber, { required: true });
  await assertBedAvailable(req.owner._id, room, bedNumber, undefined, session);

  const resident = new Resident({
    owner: req.owner._id,
    room: room._id,
    fullName,
    phone,
    email,
    joiningDate,
    monthlyRent: monthlyRent ?? room.monthlyRent, // defaults to the room's rent
    emergencyContact,
  });
  if (bedNumber) setResidentBed(resident, null, room, bedNumber);
  await applyLoginAccess(resident, req.body);
  await resident.save({ session });
  return { resident, room };
  });
  res.status(201).json({ success: true, message: `${resident.fullName} added to room ${room.roomNumber}`, data: resident });
});

export const updateResident = asyncHandler(async (req, res) => {
  const resident = await withOccupancyTransaction(req.owner._id, async (session) => {
  const resident = await findOwned(Resident, req.params.id, req, undefined, session, '+passwordHash');
  if (resident.status === 'Left') throw new ApiError(409, 'This resident has left and can no longer be edited');

  const roomChanged = req.body.room && String(req.body.room) !== String(resident.room);
  if (roomChanged) {
    const newRoom = await findOwned(Room, req.body.room, req, undefined, session);
    await assertCapacity(req.owner._id, newRoom, resident._id, session);
  }
  if (roomChanged || req.body.bedNumber !== undefined) {
    const previousRoom = await findOwned(Room, resident.room, req, undefined, session);
    const nextRoom = roomChanged ? await findOwned(Room, req.body.room, req, undefined, session) : previousRoom;
    const bedNumber = resolveBedNumber(nextRoom, req.body.bedNumber, { required: true });
    await assertBedAvailable(req.owner._id, nextRoom, bedNumber, resident._id, session);
    setResidentBed(resident, previousRoom, nextRoom, bedNumber);
  }
  ['fullName', 'phone', 'email', 'joiningDate', 'monthlyRent'].forEach((k) => {
    if (req.body[k] !== undefined) resident[k] = req.body[k];
  });
  if (req.body.emergencyContact !== undefined) {
    for (const key of ['name', 'phone']) {
      if (req.body.emergencyContact[key] !== undefined) resident.set(`emergencyContact.${key}`, req.body.emergencyContact[key]);
    }
  }
  await applyLoginAccess(resident, req.body);
  await resident.save({ session });
  return resident;
  });
  res.json({ success: true, message: 'Resident updated', data: resident });
});

// Marks the resident as Left. All history (rent, attendance) is kept.
export const markResidentLeft = asyncHandler(async (req, res) => {
  const resident = await withOccupancyTransaction(req.owner._id, async (session) => {
    const resident = await findOwned(Resident, req.params.id, req, undefined, session);
    if (resident.status === 'Left') throw new ApiError(409, 'Resident is already marked as left');
    const room = resident.bedNumber ? await findOwned(Room, resident.room, req, undefined, session) : null;
    if (room) setResidentBed(resident, room, room, undefined);
    resident.status = 'Left';
    resident.leftDate = req.body.leftDate || new Date();
    await resident.save({ session });
    return resident;
  });

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
  await withOccupancyTransaction(req.owner._id, async (session) => {
    const resident = await findOwned(Resident, req.params.id, req, undefined, session);
    const base = { owner: req.owner._id, resident: resident._id };
    const [hasRent, hasAttendance, hasInvitations] = await Promise.all([
      RentRecord.exists(base).session(session), Attendance.exists(base).session(session),
      Resident.exists({ _id: resident._id, 'activationInvitations.0': { $exists: true } }).session(session),
    ]);
    if (hasRent || hasAttendance || resident.bedAssignments?.length || hasInvitations) {
      throw new ApiError(409, 'This resident has room, activation, rent or attendance history. Mark them as left instead of deleting.');
    }
    await resident.deleteOne({ session });
  });
  res.json({ success: true, message: 'Resident deleted' });
});
