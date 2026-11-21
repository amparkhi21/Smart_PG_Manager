import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import Owner from '../models/Owner.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/ownership.js';
import { normalizePhone, publicResident, validPassword } from '../utils/residentAuth.js';
import { generateResidentToken } from '../utils/generateToken.js';

const dummyHash = bcrypt.hashSync('invalid-resident-credentials', 12);
const invalidCredentials = () => new ApiError(401, 'Invalid resident credentials. Check your details or ask your owner for the PG code.');

export const residentLogin = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    await bcrypt.compare('invalid-input', dummyHash);
    throw invalidCredentials();
  }
  const { pgName, pgCode, roomNumber, phone, password } = req.body;
  const normalizedPhone = normalizePhone(phone);
  let owner;
  if (typeof pgCode === 'string' && /^PG-[a-f\d]{24}$/i.test(pgCode.trim())) {
    owner = await Owner.findById(pgCode.trim().slice(3));
    if (owner?.pgName.toLocaleLowerCase() !== pgName.trim().toLocaleLowerCase()) owner = null;
  } else if (!pgCode) {
    const matches = await Owner.find({ pgName: new RegExp(`^${escapeRegex(pgName.trim())}$`, 'i') }).limit(2);
    // Never disclose names, addresses, owners or a list of matching PGs.
    if (matches.length === 1) [owner] = matches;
  }
  const resident = owner && normalizedPhone ? await Resident.findOne({
    owner: owner._id, normalizedPhone,
  }).select('+passwordHash') : null;
  const passwordValid = await bcrypt.compare(password, resident?.passwordHash || dummyHash);
  const room = resident ? await Room.findOne({ _id: resident.room, owner: owner._id }) : null;
  if (!resident || !passwordValid || !resident.loginEnabled || resident.accountStatus !== 'active'
      || resident.status !== 'Active' || !room || room.roomNumber !== roomNumber.trim()) throw invalidCredentials();

  const now = new Date();
  // Compare the credential snapshot so an overlapping reset/disable/move cannot log in.
  const updated = await Resident.findOneAndUpdate({
    _id: resident._id, owner: owner._id, sessionVersion: resident.sessionVersion,
    passwordHash: resident.passwordHash, loginEnabled: true, status: 'Active', room: room._id,
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
