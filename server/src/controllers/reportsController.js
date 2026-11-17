import Attendance from '../models/Attendance.js';
import ElectricityBill from '../models/ElectricityBill.js';
import RentRecord from '../models/RentRecord.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import asyncHandler from '../utils/asyncHandler.js';
import { currentMonthIST } from '../utils/dates.js';

export const getMonthlyReportData = asyncHandler(async (req, res) => {
  const ownerId = req.owner._id;
  const month = req.query.month || currentMonthIST();
  const start = `${month}-01`;
  const end = `${month}-31`;

  const [rooms, residents, rentRecords, electricityBills, attendance] = await Promise.all([
    Room.find({ owner: ownerId }).select('roomNumber floor monthlyRent capacity').sort({ roomNumber: 1 }).lean(),
    Resident.find({ owner: ownerId })
      .select('fullName status joiningDate monthlyRent room')
      .populate('room', 'roomNumber')
      .sort({ fullName: 1 })
      .lean(),
    RentRecord.find({ owner: ownerId })
      .populate('resident', 'fullName')
      .populate('room', 'roomNumber')
      .sort({ month: -1 })
      .lean(),
    ElectricityBill.find({ owner: ownerId })
      .populate('room', 'roomNumber')
      .sort({ month: -1 })
      .lean(),
    Attendance.find({ owner: ownerId, date: { $gte: start, $lte: end } })
      .select('resident room date status')
      .populate('resident', 'fullName')
      .populate('room', 'roomNumber')
      .sort({ date: 1 })
      .lean(),
  ]);

  const activeByRoom = new Map();
  residents.forEach((resident) => {
    if (resident.status !== 'Active' || !resident.room?._id) return;
    const key = String(resident.room._id);
    activeByRoom.set(key, (activeByRoom.get(key) || 0) + 1);
  });
  const ownerRooms = rooms.map((room) => ({
    ...room,
    currentResidents: activeByRoom.get(String(room._id)) || 0,
  }));
  const owner = {
    name: req.owner.name,
    pgName: req.owner.pgName,
    phone: req.owner.phone || '',
    address: req.owner.address || '',
  };

  res.json({
    success: true,
    data: { month, owner, rooms: ownerRooms, residents, rentRecords, electricityBills, attendance },
  });
});
