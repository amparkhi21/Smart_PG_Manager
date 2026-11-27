import RoomChangeRequest from '../models/RoomChangeRequest.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';

import { withOccupancyTransaction } from '../utils/occupancyTransaction.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from './notificationDeliveryService.js';
import { assertBedAvailable, resolveBedNumber } from '../utils/residentBeds.js';

const view = (request, ownerView = false) => ({
  id: request._id, fromRoom: { id: request.fromRoom, roomNumber: request.fromRoomNumber, bedNumber: request.fromBedNumber || null },
  toRoom: { id: request.toRoom, roomNumber: request.toRoomNumber, bedNumber: request.toBedNumber || null },
  reason: request.reason, status: request.status, createdAt: request.createdAt,
  decisionNote: request.decisionNote || '', decidedAt: request.decidedAt || null, cancelledAt: request.cancelledAt || null,
  ...(ownerView && { resident: { id: request.resident, fullName: request.residentName } }),
});

export const createRoomChange = async (context) => {
  const targetId = String(context.input.targetRoom).toLowerCase();
  const request = await withOccupancyTransaction(context.resident.owner, async (session) => {
    const resident = await Resident.findOne({ _id: context.resident._id, owner: context.resident.owner }).session(session);
    if (!resident || resident.status !== 'Active' || !resident.loginEnabled || resident.accountStatus !== 'active'
      || resident.passwordChangeRequired || resident.sessionVersion !== context.resident.sessionVersion) throw new ApiError(401, 'Your session has expired. Please log in again');
    if (String(resident.room) === targetId) throw new ApiError(400, 'Choose a room different from your current room');
    if (await RoomChangeRequest.exists({ owner: resident.owner, resident: resident._id, status: 'Pending' }).session(session)) {
      throw new ApiError(409, 'You already have a pending room change request');
    }
    const target = await Room.findOne({ _id: targetId, owner: resident.owner }).session(session);
    if (!target) throw new ApiError(404, 'Room not found');
    const occupied = await Resident.countDocuments({ owner: resident.owner, room: target._id, status: 'Active' }).session(session);
    if (occupied >= target.capacity) throw new ApiError(409, 'This room is full. Choose another available room.');
    const targetBedNumber = resolveBedNumber(target, context.input.targetBedNumber, { required: Boolean(target.bedNumbers?.length) });
    await assertBedAvailable(resident.owner, target, targetBedNumber, resident._id, session);
    const current = await Room.findOne({ _id: resident.room, owner: resident.owner }).session(session);
    if (!current) throw new ApiError(409, 'Your room assignment has changed. Refresh and try again.');
    const request = new RoomChangeRequest({ owner: resident.owner, resident: resident._id, residentName: resident.fullName,
      fromRoom: current._id, toRoom: target._id, fromRoomNumber: current.roomNumber, toRoomNumber: target.roomNumber,
      fromBedNumber: resident.bedNumber || null, toBedNumber: targetBedNumber || null, reason: context.input.reason });
    request.notificationEvents = [notificationEvent('room_change_requested', request._id, request.owner,
      'New room change request', `${request.residentName} requested a room change from ${request.fromRoomNumber} to ${request.toRoomNumber}.`)];
    await request.save({ session }); return request;
  }, { required: true });
  await tryDeliverNotifications(request.owner);
  return { message: 'Room change requested. Your owner will review it.', data: view(request) };
};

export const listRoomChanges = async (context) => {
  const ownerView = Boolean(context.owner);
  const scope = ownerView ? { owner: context.owner._id } : { owner: context.resident.owner, resident: context.resident._id };
  if (context.filters.status) scope.status = context.filters.status;
  const requests = await RoomChangeRequest.find(scope).sort({ createdAt: -1 }).limit(100).lean();
  return { data: { requests: requests.map((request) => view(request, ownerView)) } };
};

export const decideRoomChange = async (context) => {
  const { decision, decisionNote = '' } = context.input;
  if (decision === 'Rejected' && !decisionNote) throw new ApiError(400, 'Add a reason for rejecting this request');
  const request = await withOccupancyTransaction(context.owner._id, async (session) => {
    const request = await RoomChangeRequest.findOne({ _id: context.identifiers.id, owner: context.owner._id }).select('+notificationEvents').session(session);
    if (!request) throw new ApiError(404, 'Room change request not found');
    // Retried decisions are idempotent, including after another move is requested.
    if (request.status === decision) return request;
    if (request.status !== 'Pending') throw new ApiError(409, 'This request has already been decided');
    if (decision === 'Approved') {
      const resident = await Resident.findOne({ _id: request.resident, owner: context.owner._id }).session(session);
      if (!resident || resident.status !== 'Active' || !resident.loginEnabled || resident.accountStatus !== 'active') throw new ApiError(409, 'This resident account is no longer active');
      if (String(resident.room) !== String(request.fromRoom)) throw new ApiError(409, 'The resident has already changed rooms. Reject this outdated request.');
      const target = await Room.findOne({ _id: request.toRoom, owner: context.owner._id }).session(session);
      if (!target) throw new ApiError(409, 'The requested room is no longer available');
      const occupied = await Resident.countDocuments({ owner: context.owner._id, room: target._id, status: 'Active' }).session(session);
      if (occupied >= target.capacity) throw new ApiError(409, 'The requested room is now full');
      const targetBedNumber = resolveBedNumber(target, request.toBedNumber || '', { required: Boolean(target.bedNumbers?.length) });
      await assertBedAvailable(context.owner._id, target, targetBedNumber, resident._id, session);
      const now = new Date(), set = { room: target._id }, update = { $set: set, $inc: { __v: 1 } };
      if (targetBedNumber) set.bedNumber = targetBedNumber;
      else update.$unset = { bedNumber: 1 };
      const bedAssignments = (resident.bedAssignments || []).map((assignment) => assignment.toObject());
      if (resident.bedNumber) {
        const openAssignment = [...bedAssignments].reverse().find((assignment) => !assignment.releasedAt);
        if (openAssignment) openAssignment.releasedAt = now;
        else bedAssignments.push({ room: request.fromRoom, roomNumber: request.fromRoomNumber, bedNumber: resident.bedNumber,
          assignedAt: resident.updatedAt || resident.joiningDate || now, releasedAt: now });
      }
      if (targetBedNumber) bedAssignments.push({ room: target._id, roomNumber: target.roomNumber, bedNumber: targetBedNumber, assignedAt: now });
      set.bedAssignments = bedAssignments;
      // Keep the existing room-change session behavior while recording the bed history atomically.
      const moved = await Resident.updateOne({ _id: resident._id, owner: context.owner._id, room: request.fromRoom, status: 'Active' },
        update, { session, runValidators: true });
      if (!moved.matchedCount) throw new ApiError(409, 'The resident changed. Refresh and try again.');
    }
    request.status = decision; request.decisionNote = decisionNote;
    request.decidedAt = new Date(); request.decidedBy = context.owner._id;
    (request.notificationEvents ||= []).push(notificationEvent(`room_change_${decision.toLowerCase()}`, request._id, request.resident,
      `Room change ${decision.toLowerCase()}`, `Your request to move to room ${request.toRoomNumber} was ${decision.toLowerCase()}.`));
    await request.save({ session }); return request;
  }, { required: true });
  await tryDeliverNotifications(request.owner);
  return { message: decision === 'Approved' ? 'Room change approved. Existing rent and bills are unchanged.' : 'Room change rejected', data: view(request, true) };
};

export const cancelRoomChangeRequest = async (context) => {
  const request = await withOccupancyTransaction(context.resident.owner, async (session) => {
    const request = await RoomChangeRequest.findOne({
      _id: context.identifiers.id, owner: context.resident.owner, resident: context.resident._id,
    }).select('+notificationEvents').session(session);
    if (!request) throw new ApiError(404, 'Room change request not found');
    if (request.status !== 'Pending') throw new ApiError(409, 'Only pending room change requests can be cancelled');
    request.status = 'Cancelled'; request.cancelledAt = new Date();
    (request.notificationEvents ||= []).push(notificationEvent('room_change_cancelled', request._id, request.owner,
      'Room change request cancelled', `${request.residentName} cancelled a pending room change request.`));
    await request.save({ session });
    return request;
  }, { required: true });
  await tryDeliverNotifications(request.owner);
  return { message: 'Room change request cancelled', data: view(request) };
};
