import bcrypt from 'bcryptjs';
import Owner from '../models/Owner.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { normalizePhone, validPassword } from '../utils/residentAuth.js';
import { activationCodeHash, generateActivationCode } from '../utils/activationCodes.js';

const invitationStatus = (invitation, now = new Date()) => {
  if (invitation.usedAt) return 'Used';
  if (invitation.revokedAt) return 'Revoked';
  if (invitation.expiresAt <= now) return 'Expired';
  return 'Pending';
};

export const getPgAccess = asyncHandler(async (req, res) => {
  const [configured, owner] = await Promise.all([
    Owner.exists({ _id: req.owner._id, pgJoiningPasswordHash: { $type: 'string' } }),
    Owner.findById(req.owner._id).select('pgJoiningPasswordUpdatedAt'),
  ]);
  res.json({ success: true, data: {
    configured: Boolean(configured),
    updatedAt: owner?.pgJoiningPasswordUpdatedAt || null,
  } });
});
export const setPgJoiningPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!validPassword(password)) throw new ApiError(400, 'Use at least 8 characters and at most 72 UTF-8 bytes');
  const updatedAt = new Date();
  const pgJoiningPasswordHash = await bcrypt.hash(password, 12);
  await Owner.updateOne({ _id: req.owner._id }, { $set: { pgJoiningPasswordHash, pgJoiningPasswordUpdatedAt: updatedAt } });
  res.json({ success: true, message: 'PG joining password saved', data: { configured: true, updatedAt } });
});

export const listActivationInvitations = asyncHandler(async (req, res) => {
  const residents = await Resident.find({ owner: req.owner._id, 'activationInvitations.0': { $exists: true } })
    .select('+activationInvitations fullName room bedNumber status accountStatus')
    .populate('room', 'roomNumber');
  const now = new Date();
  const invitations = residents.flatMap((resident) => (resident.activationInvitations || []).map((invitation) => ({
    id: invitation._id,
    residentId: resident._id,
    residentName: resident.fullName,
    roomNumber: invitation.roomNumber,
    bedNumber: invitation.bedNumber,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    revokedAt: invitation.revokedAt,
    status: resident.status !== 'Active'
      || String(invitation.room) !== String(resident.room?._id || resident.room)
      || invitation.bedNumber !== resident.bedNumber
      ? 'Revoked' : invitationStatus(invitation, now),
  }))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, count: invitations.length, data: { invitations } });
});

export const createActivationInvitation = asyncHandler(async (req, res) => {
  const { residentId } = req.body;
  const expiresInDays = req.body.expiresInDays ?? 7;
  if (!(await Owner.exists({ _id: req.owner._id, pgJoiningPasswordHash: { $type: 'string' } }))) {
    throw new ApiError(409, 'Create a PG joining password before issuing student activation codes');
  }
  const resident = await Resident.findOne({ _id: residentId, owner: req.owner._id }).select('+activationInvitations');
  if (!resident) throw new ApiError(404, 'Resident not found');
  if (resident.status !== 'Active' || resident.loginEnabled || resident.accountStatus !== 'unconfigured' || !resident.bedNumber) {
    throw new ApiError(409, 'An activation code requires an active, unactivated resident assigned to a bed');
  }
  const room = await Room.findOne({ _id: resident.room, owner: req.owner._id });
  if (!room || !(room.bedNumbers || []).includes(resident.bedNumber)) {
    throw new ApiError(409, 'Assign the resident to a configured room bed before creating an activation code');
  }
  if (!normalizePhone(resident.phone)) throw new ApiError(409, 'Add a valid phone number before creating an activation code');

  const now = new Date();
  resident.activationInvitations = resident.activationInvitations || [];
  resident.activationInvitations.forEach((invitation) => {
    if (!invitation.usedAt && !invitation.revokedAt && invitation.expiresAt > now) invitation.revokedAt = now;
  });
  const code = generateActivationCode();
  const invitation = {
    codeHash: activationCodeHash(code),
    room: room._id,
    roomNumber: room.roomNumber,
    bedNumber: resident.bedNumber,
    expiresAt: new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000),
    createdAt: now,
  };
  resident.activationInvitations.push(invitation);
  await resident.save();
  const created = resident.activationInvitations[resident.activationInvitations.length - 1];
  res.status(201).json({ success: true, message: 'Activation code created. Share it with the assigned resident.', data: {
    code,
    invitation: {
      id: created._id, residentId: resident._id, residentName: resident.fullName,
      roomNumber: room.roomNumber, bedNumber: resident.bedNumber,
      createdAt: created.createdAt, expiresAt: created.expiresAt, status: 'Pending',
    },
  } });
});

export const revokeActivationInvitation = asyncHandler(async (req, res) => {
  const { residentId, invitationId } = req.body;
  const resident = await Resident.findOne({ _id: residentId, owner: req.owner._id, 'activationInvitations._id': invitationId })
    .select('+activationInvitations');
  if (!resident) throw new ApiError(404, 'Activation code not found');
  const invitation = resident.activationInvitations.id(invitationId);
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new ApiError(409, 'This activation code is no longer active');
  }
  invitation.revokedAt = new Date();
  await resident.save();
  res.json({ success: true, message: 'Activation code revoked' });
});
