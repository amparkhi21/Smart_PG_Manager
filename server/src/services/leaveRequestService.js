import mongoose from 'mongoose';
import LeaveRequest, { LeaveScheduleLock, leaveDurationDays } from '../models/LeaveRequest.js';
import { ACTIVE_LEAVE_STATUSES } from '../constants.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';

import { todayIST } from '../utils/dates.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from './notificationDeliveryService.js';

const scopeFor = (context) => context.owner ? { owner: context.owner._id } : { owner: context.resident.owner, resident: context.resident._id };
const eventFor = (context, status, response = '') => ({ status, response, actor: context.owner?._id || context.resident._id,
  actorRole: context.owner ? 'owner' : 'resident', actorName: context.owner?.name || context.resident.fullName });
const eventView = (event) => ({ id: event._id, status: event.status, response: event.response,
  actor: { id: event.actor, role: event.actorRole, name: event.actorName }, createdAt: event.createdAt });
const view = (request) => ({
  id: request._id, pgId: request.owner, resident: { id: request.resident, fullName: request.residentName },
  room: { id: request.room, roomNumber: request.roomNumber, bedNumber: request.bedNumber || null }, fromDate: request.fromDate, toDate: request.toDate,
  durationDays: request.durationDays, reason: request.reason, emergencyContact: request.emergencyContact || null,
  status: request.status, response: request.response, decidedAt: request.decidedAt, cancelledAt: request.cancelledAt,
  createdAt: request.createdAt, updatedAt: request.updatedAt, history: request.history.map(eventView),
});
const mutationResult = (request) => ({ data: view(request), event: { ...eventView(request.history.at(-1)),
  leaveRequestId: request._id, pgId: request.owner, residentId: request.resident } });

async function scheduleTransaction(owner, resident, work) {
  const id = `${owner}:${resident}`;
  // Create the lock outside the transaction so concurrent first submissions share the same document.
  try { await LeaveScheduleLock.updateOne({ _id: id }, { $setOnInsert: { owner, resident, revision: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  return mongoose.connection.transaction(async (session) => {
    await LeaveScheduleLock.updateOne({ _id: id, owner, resident }, { $inc: { revision: 1 } }, { session });
    return work(session);
  }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
}
async function activeResident(context, session) {
  const resident = await Resident.findOne({ _id: context.resident._id, owner: context.resident.owner, status: 'Active', loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false, sessionVersion: context.resident.sessionVersion }).session(session);
  if (!resident) throw new ApiError(401, 'Your session has expired. Please log in again');
  return resident;
}
async function ownedRequest(context, session) {
  const query = LeaveRequest.findOne({ _id: context.identifiers.id, ...scopeFor(context) });
  if (session) query.session(session).select('+notificationEvents');
  const request = await query;
  if (!request) throw new ApiError(404, 'Leave request not found');
  return request;
}
async function overlap(owner, resident, fromDate, toDate, session, except) {
  return LeaveRequest.exists({ owner, resident, status: { $in: ACTIVE_LEAVE_STATUSES },
    fromDate: { $lte: toDate }, toDate: { $gte: fromDate }, ...(except && { _id: { $ne: except } }) }).session(session);
}

export const createLeaveRequest = async (context) => {
  const request = await scheduleTransaction(context.resident.owner, context.resident._id, async (session) => {
    const resident = await activeResident(context, session);
    if (context.input.fromDate < todayIST()) throw new ApiError(400, 'Leave cannot start before today in India');
    if (await overlap(resident.owner, resident._id, context.input.fromDate, context.input.toDate, session)) throw new ApiError(409, 'These dates overlap an existing Pending or Approved leave request');
    const room = await Room.findOne({ _id: resident.room, owner: resident.owner }).select('roomNumber').session(session);
    if (!room) throw new ApiError(409, 'Your room assignment is no longer available');
    const request = new LeaveRequest({ owner: resident.owner, resident: resident._id, residentName: resident.fullName,
      room: room._id, roomNumber: room.roomNumber, bedNumber: resident.bedNumber || null, fromDate: context.input.fromDate, toDate: context.input.toDate,
      durationDays: leaveDurationDays(context.input.fromDate, context.input.toDate), reason: context.input.reason,
      emergencyContact: context.input.emergencyContact || '', history: [eventFor(context, 'Pending')] });
    request.notificationEvents = [notificationEvent('leave_requested', request._id, request.owner,
      'New leave request', `${request.residentName} requested leave from ${request.fromDate} to ${request.toDate}.`, request.history[0]._id)];
    await request.save({ session });
    return request;
  });
  await tryDeliverNotifications(request.owner);
  return { message: 'Leave request submitted', ...mutationResult(request) };
};
export const listLeaveRequests = async (context) => {
  const scope = scopeFor(context), page = Number(context.filters.page || 1), limit = Number(context.filters.limit || 20);
  if (context.filters.status) scope.status = context.filters.status;
  if (context.owner && context.filters.resident) scope.resident = context.filters.resident;
  if (context.filters.date && (context.filters.fromDate || context.filters.toDate)) throw new ApiError(400, 'Use a single date or a date range');
  if (context.filters.fromDate && context.filters.toDate && context.filters.fromDate > context.filters.toDate) throw new ApiError(400, 'From date must be on or before to date');
  const from = context.filters.date || context.filters.fromDate, to = context.filters.date || context.filters.toDate;
  if (from) scope.toDate = { $gte: from };
  if (to) scope.fromDate = { $lte: to };
  const [requests, total] = await Promise.all([
    LeaveRequest.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LeaveRequest.countDocuments(scope),
  ]);
  return { count: requests.length, data: { requests: requests.map(view), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } };
};
export const getLeaveRequest = async (context) => {
  return { data: view(await ownedRequest(context)) };
};
export const cancelLeaveRequest = async (context) => {
  const request = await scheduleTransaction(context.resident.owner, context.resident._id, async (session) => {
    await activeResident(context, session);
    const request = await ownedRequest(context, session);
    if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending leave requests can be cancelled');
    request.status = 'Cancelled'; request.cancelledAt = new Date(); request.history.push(eventFor(context, 'Cancelled'));
    await request.save({ session }); return request;
  });
  return { message: 'Leave request cancelled', ...mutationResult(request) };
};
export const decideLeaveRequest = async (context) => {
  const target = await ownedRequest(context);
  const request = await scheduleTransaction(context.owner._id, target.resident, async (session) => {
    const request = await ownedRequest(context, session);
    if (request.status !== 'Pending') throw new ApiError(409, 'This leave request has already been finalized');
    if (context.input.decision === 'Approved' && await overlap(request.owner, request.resident, request.fromDate, request.toDate, session, request._id)) throw new ApiError(409, 'These dates overlap another active leave request');
    request.status = context.input.decision; request.response = context.input.response || ''; request.decidedAt = new Date();
    request.history.push(eventFor(context, request.status, request.response));
    (request.notificationEvents ||= []).push(notificationEvent(`leave_${request.status.toLowerCase()}`, request._id, request.resident,
      `Leave request ${request.status.toLowerCase()}`, `Your leave from ${request.fromDate} to ${request.toDate} was ${request.status.toLowerCase()}.`, request.history.at(-1)._id));
    await request.save({ session }); return request;
  });
  await tryDeliverNotifications(request.owner);
  return { message: `Leave request ${request.status.toLowerCase()}`, ...mutationResult(request) };
};
