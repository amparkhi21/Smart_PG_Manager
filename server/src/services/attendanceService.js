import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';

import { todayIST, currentMonthIST } from '../utils/dates.js';

// All active residents with their status for one date (null = not marked yet).
// Perfect for a one-screen "mark attendance" view.
export const getAttendance = async (context) => {
  const ownerId = context.owner._id;
  const date = context.filters.date || todayIST();
  const filter = { owner: ownerId, status: 'Active' };
  if (context.filters.room) filter.room = context.filters.room;
  if (context.filters.resident) filter._id = context.filters.resident;

  const residents = await Resident.find(filter).populate('room', 'roomNumber').sort({ fullName: 1 }).lean();
  const records = await Attendance.find({ owner: ownerId, date, resident: { $in: residents.map((r) => r._id) } }).lean();
  const byResident = new Map(records.map((a) => [String(a.resident), a]));

  const summary = { Present: 0, Absent: 0, 'On Leave': 0, Unmarked: 0 };
  const data = residents.map((r) => {
    const rec = byResident.get(String(r._id));
    summary[rec ? rec.status : 'Unmarked'] += 1;
    return {
      resident: { _id: r._id, fullName: r.fullName, phone: r.phone },
      room: r.room,
      date,
      status: rec ? rec.status : null,
      note: rec?.note || '',
    };
  });
  return { date, summary, count: data.length, data };
};

// Mark or update attendance for many residents in one request (safe to repeat)
export const markAttendance = async (context) => {
  const ownerId = context.owner._id;
  const { date, records } = context.input;

  const latest = new Map(records.map((r) => [String(r.resident), r])); // last entry per resident wins
  const ids = [...latest.keys()];
  const residents = await Resident.find({ _id: { $in: ids }, owner: ownerId, status: 'Active' }).select('room');
  if (residents.length !== ids.length) {
    throw new ApiError(400, 'One or more residents were not found or are no longer active');
  }
  const roomOf = new Map(residents.map((r) => [String(r._id), r.room]));

  const ops = [...latest.values()].map((r) => ({
    updateOne: {
      filter: { owner: ownerId, resident: r.resident, date },
      update: { $set: { owner: ownerId, room: roomOf.get(String(r.resident)), status: r.status, note: r.note || '' } },
      upsert: true,
    },
  }));
  await Attendance.bulkWrite(ops);
  return { message: `Attendance saved for ${ops.length} resident(s) on ${date}`, data: { date, saved: ops.length } };
};

// Monthly summary: Present / Absent / On Leave counts per resident
export const getMonthlySummary = async (context) => {
  const ownerId = context.owner._id;
  const month = context.filters.month || currentMonthIST();
  const match = { owner: ownerId, date: { $gte: `${month}-01`, $lte: `${month}-31` } };
  if (context.filters.resident) match.resident = new mongoose.Types.ObjectId(context.filters.resident);
  if (context.filters.room) match.room = new mongoose.Types.ObjectId(context.filters.room);

  const rows = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: { resident: '$resident', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const perResident = new Map();
  rows.forEach(({ _id, count }) => {
    const key = String(_id.resident);
    if (!perResident.has(key)) perResident.set(key, { resident: _id.resident, Present: 0, Absent: 0, 'On Leave': 0 });
    perResident.get(key)[_id.status] = count;
  });

  const people = await Resident.find({ _id: { $in: [...perResident.values()].map((p) => p.resident) }, owner: ownerId })
    .select('fullName status')
    .populate('room', 'roomNumber')
    .lean();
  const data = people.map((p) => ({ resident: p, ...perResident.get(String(p._id)), resident: p }));
  return { month, count: data.length, data };
};