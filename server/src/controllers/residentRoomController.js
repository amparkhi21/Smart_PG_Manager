import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Explicit public fields: owner notes, meter data, resident identities and bills stay private.
const ROOM_FIELDS = 'roomNumber floor roomType airConditioning amenities monthlyRent capacity bedNumbers';
const roomView = (room, occupiedBeds, bedCounts = new Map()) => ({
  id: room._id, roomNumber: room.roomNumber, floor: room.floor || null,
  roomType: room.roomType || null, airConditioning: room.airConditioning || null,
  amenities: room.amenities || [], monthlyRent: room.monthlyRent, capacity: room.capacity,
  occupiedBeds, availableBeds: Math.max(0, room.capacity - occupiedBeds),
  beds: (room.bedNumbers || []).map((bedNumber) => ({
    bedNumber, available: !bedCounts.get(`${String(room._id)}:${bedNumber.toLocaleLowerCase()}`),
  })),
  status: occupiedBeds >= room.capacity ? 'Full' : occupiedBeds === 0 ? 'Vacant' : 'Partially Occupied',
});

export const getMyRoom = asyncHandler(async (req, res) => {
  const scope = { owner: req.resident.owner, room: req.resident.room };
  const [room, occupiedBeds] = await Promise.all([
    Room.findOne({ owner: scope.owner, _id: scope.room }).select(ROOM_FIELDS).lean(),
    Resident.countDocuments({ ...scope, status: 'Active' }),
  ]);
  if (!room) throw new ApiError(404, 'Your assigned room is unavailable');
  res.json({ success: true, data: { room: { ...roomView(room, occupiedBeds), bedNumber: req.resident.bedNumber || null, assignedMonthlyRent: req.resident.monthlyRent } } });
});

export const getRoomAvailability = asyncHandler(async (req, res) => {
  const owner = req.resident.owner;
  const rooms = await Room.find({ owner }).select(ROOM_FIELDS).sort({ roomNumber: 1 }).lean();
  const [counts, bedCounts] = await Promise.all([Resident.aggregate([
    { $match: { owner, status: 'Active', room: { $in: rooms.map((room) => room._id) } } },
    { $group: { _id: '$room', count: { $sum: 1 } } },
  ]), Resident.aggregate([
    { $match: { owner, status: 'Active', room: { $in: rooms.map((room) => room._id) }, bedNumber: { $type: 'string' } } },
    { $group: { _id: { room: '$room', bedNumber: { $toLower: '$bedNumber' } }, count: { $sum: 1 } } },
  ])]);
  const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
  const bedMap = new Map(bedCounts.map((item) => [`${String(item._id.room)}:${item._id.bedNumber}`, item.count]));
  const { search = '', floor, roomType, availability } = req.query;
  const needle = search.toLowerCase();
  const matching = rooms.map((room) => roomView(room, countMap.get(String(room._id)) || 0, bedMap))
    .filter((room) => (!floor || room.floor === floor) && (!roomType || room.roomType === roomType)
      && (!availability || room.status === availability)
      && (!needle || [room.roomNumber, room.floor, room.roomType].some((value) => value?.toLowerCase().includes(needle))));
  res.json({ success: true, count: matching.length, data: {
    rooms: matching,
    currentRoomId: req.resident.room,
    filters: {
      floors: [...new Set(rooms.map((room) => room.floor).filter(Boolean))].sort(),
      roomTypes: [...new Set(rooms.map((room) => room.roomType).filter(Boolean))].sort(),
    },
  } });
});
