import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import Owner from '../models/Owner.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/ownership.js';
import { normalizePhone, pgCode as pgCodeFor, publicResident, validPassword } from '../utils/residentAuth.js';
import { generateResidentToken } from '../utils/generateToken.js';
import { activationCodeHash } from '../utils/activationCodes.js';

const dummyHash = bcrypt.hashSync('invalid-resident-credentials', 12);
const dummyJoiningHash = bcrypt.hashSync('invalid-pg-joining-password', 12);
const invalidCredentials = () => new ApiError(401, 'Invalid resident credentials. Check your details or ask your owner for the PG code.');
const invalidJoin = () => new ApiError(401, 'Unable to verify joining details. Check your PG, room, bed and ask your owner if access is ready.');

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
      || resident.status !== 'Active' || !room || (roomNumber && room.roomNumber !== roomNumber.trim())) throw invalidCredentials();

  const now = new Date();
  // Compare the credential snapshot so an overlapping reset/disable/move cannot log in.
  const updated = await Resident.findOneAndUpdate({
    _id: resident._id, owner: owner._id, sessionVersion: resident.sessionVersion,
    passwordHash: resident.passwordHash, loginEnabled: true, status: 'Active', room: room._id,
  }, { $set: { lastLoginAt: now }, $min: { firstLoginAt: now }, $inc: { __v: 1 } }, { new: true });
  if (!updated) throw invalidCredentials();
  res.json({ success: true, data: { role: 'resident', token: generateResidentToken(updated), resident: publicResident(updated, owner, room) } });
});

export const verifyResidentJoin = asyncHandler(async (req, res) => {
  const { pgName, pgCode, pgJoiningPassword, roomNumber, bedNumber } = req.body;
  const normalizedPgName = pgName.trim().toLocaleLowerCase();
  let candidates = [];
  if (pgCode) {
    const match = /^PG-([a-f\d]{24})$/i.exec(pgCode.trim());
    if (match) {
      const owner = await Owner.findById(match[1]).select('+pgJoiningPasswordHash');
      if (owner && owner.pgName.toLocaleLowerCase() === normalizedPgName) candidates = [owner];
    }
  } else {
    candidates = await Owner.find({ pgName: new RegExp(`^${escapeRegex(pgName.trim())}$`, 'i') })
      .select('+pgJoiningPasswordHash').limit(5);
  }

  const checked = candidates.length
    ? await Promise.all(candidates.map(async (owner) => ({
      owner,
      valid: await bcrypt.compare(pgJoiningPassword, owner.pgJoiningPasswordHash || dummyJoiningHash),
    })))
    : (await bcrypt.compare(pgJoiningPassword, dummyJoiningHash), []);
  const matchingOwners = checked.filter(({ valid }) => valid).map(({ owner }) => owner);
  if (!matchingOwners.length) throw invalidJoin();
  if (matchingOwners.length > 1) {
    return res.status(409).json({ success: false, message: 'Choose the PG code for your hostel', data: {
      requiresPgCode: true, pgCodes: matchingOwners.map((owner) => pgCodeFor(owner._id)),
    } });
  }

  const owner = matchingOwners[0];
  const room = await Room.findOne({
    owner: owner._id,
    roomNumber: new RegExp(`^${escapeRegex(roomNumber.trim())}$`, 'i'),
  });
  const canonicalBed = (room?.bedNumbers || []).find((bed) => bed.toLocaleLowerCase() === bedNumber.trim().toLocaleLowerCase());
  const resident = room && canonicalBed ? await Resident.findOne({
    owner: owner._id,
    room: room._id,
    bedNumber: canonicalBed,
    status: 'Active',
    loginEnabled: false,
    accountStatus: 'unconfigured',
  }) : null;
  if (!resident || !normalizePhone(resident.phone)) throw invalidJoin();

  const challenge = jwt.sign({
    purpose: 'resident-activation',
    ownerId: String(owner._id),
    residentId: String(resident._id),
    roomId: String(room._id),
    bedNumber: canonicalBed,
  }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
  res.json({ success: true, data: { challenge, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
});

export const activateResident = asyncHandler(async (req, res) => {
  const { challenge, activationCode, password } = req.body;
  let claims;
  try {
    claims = jwt.verify(challenge, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Joining verification expired. Start again with your PG details.');
  }
  if (claims?.purpose !== 'resident-activation'
      || !/^[a-f\d]{24}$/i.test(claims.ownerId || '')
      || !/^[a-f\d]{24}$/i.test(claims.residentId || '')
      || !/^[a-f\d]{24}$/i.test(claims.roomId || '')
      || typeof claims.bedNumber !== 'string') {
    throw new ApiError(401, 'Joining verification expired. Start again with your PG details.');
  }
  if (!validPassword(password)) throw new ApiError(400, 'Use at least 8 characters and at most 72 UTF-8 bytes');

  const now = new Date();
  const codeHash = activationCodeHash(activationCode);
  const filter = {
    _id: claims.residentId,
    owner: claims.ownerId,
    room: claims.roomId,
    bedNumber: claims.bedNumber,
    status: 'Active',
    loginEnabled: false,
    accountStatus: 'unconfigured',
    activationInvitations: { $elemMatch: {
      codeHash,
      room: claims.roomId,
      bedNumber: claims.bedNumber,
      expiresAt: { $gt: now },
      usedAt: null,
      revokedAt: null,
    } },
  };
  const eligible = await Resident.findOne(filter).select('phone');
  if (!eligible || !normalizePhone(eligible.phone)) throw new ApiError(401, 'Invalid or expired activation code');
  const passwordHash = await bcrypt.hash(password, 12);
  const resident = await Resident.findOneAndUpdate(filter, {
    $set: {
      'activationInvitations.$.usedAt': now,
      passwordHash,
      normalizedPhone: normalizePhone(eligible.phone),
      loginEnabled: true,
      accountStatus: 'active',
      passwordChangeRequired: false,
      lastLoginAt: now,
    },
    $min: { firstLoginAt: now },
    $inc: { sessionVersion: 1, __v: 1 },
  }, { new: true });
  if (!resident) throw new ApiError(401, 'Invalid or expired activation code');

  const [owner, room] = await Promise.all([
    Owner.findById(claims.ownerId),
    Room.findOne({ _id: claims.roomId, owner: claims.ownerId }),
  ]);
  if (!owner || !room) throw new ApiError(401, 'Invalid or expired activation code');
  res.json({ success: true, data: {
    role: 'resident', token: generateResidentToken(resident), resident: publicResident(resident, owner, room),
  } });
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
