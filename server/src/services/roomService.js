import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import RentRecord from '../models/RentRecord.js';
import ElectricityBill from '../models/ElectricityBill.js';
import ApiError from '../utils/ApiError.js';

import { findOwned, escapeRegex } from '../utils/ownership.js';
import { withOccupancyTransaction } from '../utils/occupancyTransaction.js';
import { validateBedNumbers } from '../utils/residentBeds.js';

export const listRooms = async (context) => {
  const { search, status } = context.filters;
  const filter = { owner: context.owner._id };
  if (search) filter.roomNumber = new RegExp(escapeRegex(search), 'i');

  const rooms = await Room.find(filter).sort({ roomNumber: 1 }).lean();
  const counts = await Resident.aggregate([
    { $match: { owner: context.owner._id, status: 'Active' } },
    { $group: { _id: '$room', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  let data = rooms.map((r) => {
    const currentResidents = countMap.get(String(r._id)) || 0;
    return { ...r, currentResidents, status: currentResidents > 0 ? 'Occupied' : 'Vacant' };
  });
  if (status) data = data.filter((r) => r.status.toLowerCase() === String(status).toLowerCase());

  return { count: data.length, data };
};

export const getRoom = async (context) => {
  const room = await findOwned(Room, context.identifiers.id, context);
  const [residents, recentBills] = await Promise.all([
    Resident.find({ owner: context.owner._id, room: room._id, status: 'Active' }),
    ElectricityBill.find({ owner: context.owner._id, room: room._id }).sort({ month: -1 }).limit(3),
  ]);
  return {
    data: { ...room.toObject(), residents, recentBills, status: residents.length ? 'Occupied' : 'Vacant' },
  };
};

export const createRoom = async (context) => {
  const { roomNumber, floor, roomType, airConditioning, amenities, monthlyRent, capacity, lastMeterReading, notes, bedNumbers } = context.input;
  const beds = bedNumbers ?? Array.from({ length: capacity }, (_, index) => `B${index + 1}`);
  validateBedNumbers(beds, capacity);
  const room = await Room.create({
    owner: context.owner._id,
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
  return { message: `Room ${room.roomNumber} added`, data: room };
};

export const updateRoom = async (context) => {
  const room = await withOccupancyTransaction(context.owner._id, async (session) => {
  const room = await findOwned(Room, context.identifiers.id, context, undefined, session);

  if (context.input.capacity !== undefined) {
    const active = await Resident.countDocuments({ owner: context.owner._id, room: room._id, status: 'Active' }).session(session);
    if (context.input.capacity < active) {
      throw new ApiError(409, `Room ${room.roomNumber} has ${active} active resident(s). Capacity cannot be less than that.`);
    }
  }

  if (context.input.bedNumbers !== undefined || context.input.capacity !== undefined) {
    validateBedNumbers(context.input.bedNumbers ?? (room.bedNumbers?.length ? room.bedNumbers : undefined), context.input.capacity ?? room.capacity);
  }
  if (context.input.bedNumbers !== undefined) {
    const nextBeds = new Set(context.input.bedNumbers.map((value) => value.toLocaleLowerCase()));
    const assignedResidents = await Resident.find({
      owner: context.owner._id, room: room._id, status: 'Active', bedNumber: { $type: 'string' },
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
    if (context.input[k] !== undefined) room[k] = context.input[k];
  });
  await room.save({ session });
  return room;
  });
  return { message: 'Room updated', data: room };
};

export const deleteRoom = async (context) => {
  const room = await withOccupancyTransaction(context.owner._id, async (session) => {
  const room = await findOwned(Room, context.identifiers.id, context, undefined, session);
  const base = { owner: context.owner._id, room: room._id };

  const active = await Resident.countDocuments({ ...base, status: 'Active' }).session(session);
  if (active > 0) {
    throw new ApiError(409, `Room ${room.roomNumber} still has ${active} active resident(s). Move or remove them first.`);
  }
  const anyResident = await Resident.exists(base).session(session);
  const hasBedHistory = await Resident.exists({ owner: context.owner._id, 'bedAssignments.room': room._id }).session(session);
  const anyRent = await RentRecord.exists(base).session(session);
  const anyBill = await ElectricityBill.exists(base).session(session);
  if (anyResident || hasBedHistory || anyRent || anyBill) {
    throw new ApiError(409, `Room ${room.roomNumber} has resident, rent or electricity history, so it cannot be deleted.`);
  }
  await room.deleteOne({ session });
  return room;
  });
  return { message: `Room ${room.roomNumber} deleted` };
};
