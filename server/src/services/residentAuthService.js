import bcrypt from 'bcryptjs';

import Owner from '../models/Owner.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';

import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/ownership.js';
import { publicResident, validPassword } from '../utils/residentAuth.js';
import { generateResidentToken } from '../utils/generateToken.js';

const dummyHash = bcrypt.hashSync('invalid-resident-credentials', 12);
const invalidCredentials = () => new ApiError(401, 'Invalid resident details. Check your hostel, room, bed and password.');

export const residentHostels = async (context) => {
  const name = typeof context.filters.name === 'string' ? context.filters.name.trim() : '';
  if (name.length < 2) return { data: { hostels: [] } };
  const owners = await Owner.find({ pgName: new RegExp(`^${escapeRegex(name)}$`, 'i') })
    .select('pgName address').limit(10).lean();
  return { data: { hostels: owners.map((owner) => ({
    id: String(owner._id), pgName: owner.pgName, address: owner.address || '',
  })) } };
};

export const residentLogin = async (context) => {
  if (!context.credentialsValid) {
    await bcrypt.compare('invalid-input', dummyHash);
    throw invalidCredentials();
  }
  const { ownerId, pgName, roomNumber, bedNumber, password } = context.input;
  const owner = /^[a-f\d]{24}$/i.test(ownerId || '')
    ? await Owner.findOne({ _id: ownerId, pgName: new RegExp(`^${escapeRegex(pgName.trim())}$`, 'i') })
    : null;
  const room = owner ? await Room.findOne({ owner: owner._id,
    roomNumber: new RegExp(`^${escapeRegex(roomNumber.trim())}$`, 'i'),
    bedNumbers: new RegExp(`^${escapeRegex(bedNumber.trim())}$`, 'i'),
  }) : null;
  const matches = owner && room ? await Resident.find({
    owner: owner._id, room: room._id, status: 'Active',
    bedNumber: new RegExp(`^${escapeRegex(bedNumber.trim())}$`, 'i'),
  }).select('+passwordHash').limit(2) : [];
  const resident = matches.length === 1 ? matches[0] : null;
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
  return { data: { role: 'resident', token: generateResidentToken(updated), resident: publicResident(updated, owner, room) } };
};

export const residentMe = async (context) => {
  return { data: { role: 'resident', resident: publicResident(context.resident, context.residentOwner, context.residentRoom) } };
};

export const changeResidentPassword = async (context) => {
  const { currentPassword, newPassword } = context.input;
  if (!validPassword(newPassword)) throw new ApiError(400, 'Use at least 8 characters and at most 72 UTF-8 bytes');
  const resident = await Resident.findOne({ _id: context.resident._id, owner: context.resident.owner }).select('+passwordHash');
  if (!resident || resident.sessionVersion !== context.resident.sessionVersion || !resident.loginEnabled || resident.status !== 'Active') {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }
  if (!(await bcrypt.compare(currentPassword, resident.passwordHash))) throw new ApiError(400, 'Current password is incorrect');
  if (await bcrypt.compare(newPassword, resident.passwordHash)) throw new ApiError(400, 'Choose a different password');
  resident.passwordHash = await bcrypt.hash(newPassword, 12);
  resident.passwordChangeRequired = false;
  await resident.save();
  return { message: 'Password changed', data: {
    role: 'resident', token: generateResidentToken(resident), resident: publicResident(resident, context.residentOwner, context.residentRoom),
  } };
};
