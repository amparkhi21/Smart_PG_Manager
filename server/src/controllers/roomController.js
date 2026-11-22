import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { findOwned, escapeRegex } from '../utils/ownership.js';
import { withOccupancyTransaction } from '../utils/occupancyTransaction.js';
import { validateBedNumbers } from '../utils/residentBeds.js';

export const listRooms = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const filter = { owner: req.owner._id };
  if (search) filter.roomNumber = new RegExp(escapeRegex(search), 'i');

  const rooms = await Room.find(filter).sort({ roomNumber: 1 }).lean();
  const counts = await Resident.aggregate([
    { $match: { owner: req.owner._id, status: 'Active' } },
    { $group: { _id: '$room', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  let data = rooms.map((r) => {
    const currentResidents = countMap.get(String(r._id)) || 0;
    return { ...r, currentResidents, status: currentResidents > 0 ? 'Occupied' : 'Vacant' };
  });
  if (status) data = data.filter((r) => r.status.toLowerCase() === String(status).toLowerCase());

  res.json({ success: true, count: data.length, data });
});

export const getRoom = asyncHandler(async (req, res) => {
  const room = await findOwned(Room, req.params.id, req);
  const [residents, recentBills] = await Promise.all([
    Resident.find({ owner: req.owner._id, room: room._id, status: 'Active' }),
    ElectricityBill.find({ owner: req.owner._id, room: room._id }).sort({ month: -1 }).limit(3),
  ]);
  res.json({
    success: true,
    data: { ...room.toObject(), residents, recentBills, status: residents.length ? 'Occupied' : 'Vacant' },
  });
});

export const createRoom = asyncHandler(async (req, res) => {
  const { roomNumber, floor, roomType, airConditioning, amenities, monthlyRent, capacity, lastMeterReading, notes, bedNumbers } = req.body;
  const beds = bedNumbers ?? Array.from({ length: capacity }, (_, index) => `B${index + 1}`);
  validateBedNumbers(beds, capacity);
  const room = await Room.create({
    owner: req.owner._id,
    roomNumber,
    floor,
    roomType,
    airConditioning,
    amenities,
    monthlyRent,
    capacity,
    bedNumbers: beds,
    lastMeterReading,
    notes,
  });
  res.status(201).json({ success: true, message: `Room ${room.roomNumber} added`, data: room });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const room = await withOccupancyTransaction(req.owner._id, async (session) => {
  const room = await findOwned(Room, req.params.id, req, undefined, session);

  if (req.body.capacity !== undefined) {
    const active = await Resident.countDocuments({ owner: req.owner._id, room: room._id, status: 'Active' }).session(session);
    if (req.body.capacity < active) {
      throw new ApiError(409, `Room ${room.roomNumber} has ${active} active resident(s). Capacity cannot be less than that.`);
    }
  }

  if (req.body.bedNumbers !== undefined || req.body.capacity !== undefined) {
    validateBedNumbers(req.body.bedNumbers ?? (room.bedNumbers?.length ? room.bedNumbers : undefined), req.body.capacity ?? room.capacity);
  }
  if (req.body.bedNumbers !== undefined) {
    const nextBeds = new Set(req.body.bedNumbers.map((value) => value.toLocaleLowerCase()));
    const assignedResidents = await Resident.find({
      owner: req.owner._id, room: room._id, status: 'Active', bedNumber: { $type: 'string' },
    }).select('bedNumber').session(session);
    const assignedBeds = assignedResidents.map((resident) => resident.bedNumber.toLocaleLowerCase());
    if (new Set(assignedBeds).size !== assignedBeds.length) {
      throw new ApiError(409, 'Existing residents have conflicting bed assignments. Resolve these assignments manually before configuring beds.');
    }
    const removedBed = assignedResidents.find((resident) => !nextBeds.has(resident.bedNumber.toLocaleLowerCase()));
    if (removedBed) throw new ApiError(409, `Bed ${removedBed.bedNumber} is assigned to an active resident and cannot be removed`);
  }

  // A rent change only affects residents added and rent generated from now on.
  ['roomNumber', 'floor', 'roomType', 'airConditioning', 'amenities', 'monthlyRent', 'capacity', 'notes', 'bedNumbers'].forEach((k) => {
    if (req.body[k] !== undefined) room[k] = req.body[k];
  });
  await room.save({ session });
  return room;
  });
  res.json({ success: true, message: 'Room updated', data: room });
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const room = await withOccupancyTransaction(req.owner._id, async (session) => {
  const room = await findOwned(Room, req.params.id, req, undefined, session);
  const base = { owner: req.owner._id, room: room._id };

  const active = await Resident.countDocuments({ ...base, status: 'Active' }).session(session);
  if (active > 0) {
    throw new ApiError(409, `Room ${room.roomNumber} still has ${active} active resident(s). Move or remove them first.`);
  }
  const anyResident = await Resident.exists(base).session(session);
  const hasBedHistory = await Resident.exists({ owner: req.owner._id, 'bedAssignments.room': room._id }).session(session);
  const anyRent = await RentRecord.exists(base).session(session);
  const anyBill = await ElectricityBill.exists(base).session(session);
  if (anyResident || hasBedHistory || anyRent || anyBill) {
    throw new ApiError(409, `Room ${room.roomNumber} has resident, rent or electricity history, so it cannot be deleted.`);
  }
  await room.deleteOne({ session });
  return room;
  });
  res.json({ success: true, message: `Room ${room.roomNumber} deleted` });
});
