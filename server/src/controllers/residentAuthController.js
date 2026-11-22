import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import Owner from '../models/Owner.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/ownership.js';
import { publicResident, validPassword } from '../utils/residentAuth.js';
import { generateResidentToken } from '../utils/generateToken.js';

const dummyHash = bcrypt.hashSync('invalid-resident-credentials', 12);
const invalidCredentials = () => new ApiError(401, 'Invalid resident details. Check your hostel, room, bed and password.');

export const residentHostels = asyncHandler(async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (name.length < 2) return res.json({ success: true, data: { hostels: [] } });
  const owners = await Owner.find({ pgName: new RegExp(`^${escapeRegex(name)}$`, 'i') })
    .select('pgName address').limit(10).lean();
  res.json({ success: true, data: { hostels: owners.map((owner) => ({
    id: String(owner._id), pgName: owner.pgName, address: owner.address || '',
  })) } });
});

export const residentLogin = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    await bcrypt.compare('invalid-input', dummyHash);
    throw invalidCredentials();
  }
  const { ownerId, pgName, roomNumber, bedNumber, password } = req.body;
  const owner = /^[a-f\d]{24}$/i.test(ownerId || '')
    ? await Owner.findOne({ _id: ownerId, pgName: new RegExp(`^${escapeRegex(pgName.trim())}$`, 'i') })
    : null;
  const room = owner ? await Room.findOne({ owner: owner._id,
    roomNumber: new RegExp(`^${escapeRegex(roomNumber.trim())}$`, 'i'),
    bedNumbers: new RegExp(`^${escapeRegex(bedNumber.trim())}$`, 'i'),
  }) : null;
  const resident = owner && room ? await Resident.findOne({
    owner: owner._id, room: room._id,
    bedNumber: new RegExp(`^${escapeRegex(bedNumber.trim())}$`, 'i'),
  }).select('+passwordHash') : null;
  const passwordValid = await bcrypt.compare(password, resident?.passwordHash || dummyHash);
  if (!resident || !passwordValid || !resident.loginEnabled || resident.accountStatus !== 'active'
      || resident.status !== 'Active' || !room || String(resident.room) !== String(room._id)
      || resident.bedNumber?.toLocaleLowerCase() !== bedNumber.trim().toLocaleLowerCase()) throw invalidCredentials();

  const now = new Date();
  // Compare the credential snapshot so an overlapping reset/disable/move cannot log in.
  const updated = await Resident.findOneAndUpdate({
    _id: resident._id, owner: owner._id, sessionVersion: resident.sessionVersion,
    passwordHash: resident.passwordHash, loginEnabled: true, status: 'Active', room: room._id, bedNumber: resident.bedNumber,
  }, { $set: { lastLoginAt: now }, $min: { firstLoginAt: now }, $inc: { __v: 1 } }, { new: true });
  if (!updated) throw invalidCredentials();
  res.json({ success: true, data: { role: 'resident', token: generateResidentToken(updated), resident: publicResident(updated, owner, room) } });
});

export const residentMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { role: 'resident', resident: publicResident(req.resident, req.residentOwner, req.residentRoom) } });
});

export const changeResidentPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!validPassword(newPassword)) throw new ApiError(400, 'Use at least 8 characters and at most 72 UTF-8 bytes');
  const resident = await Resident.findOne({ _id: req.resident._id, owner: req.resident.owner }).select('+passwordHash');
  if (!resident || resident.sessionVersion !== req.resident.sessionVersion || !resident.loginEnabled || resident.status !== 'Active') {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }
  if (!(await bcrypt.compare(currentPassword, resident.passwordHash))) throw new ApiError(400, 'Current password is incorrect');
  if (await bcrypt.compare(newPassword, resident.passwordHash)) throw new ApiError(400, 'Choose a different password');
  resident.passwordHash = await bcrypt.hash(newPassword, 12);
  resident.passwordChangeRequired = false;
  await resident.save();
  res.json({ success: true, message: 'Password changed', data: {
    role: 'resident', token: generateResidentToken(resident), resident: publicResident(resident, req.residentOwner, req.residentRoom),
  } });
});
