import mongoose from 'mongoose';
import LeaveRequest, { LeaveScheduleLock, ACTIVE_LEAVE_STATUSES, leaveDurationDays } from '../models/LeaveRequest.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { todayIST } from '../utils/dates.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from '../utils/notifications.js';

const scopeFor = (req) => req.owner ? { owner: req.owner._id } : { owner: req.resident.owner, resident: req.resident._id };
const eventFor = (req, status, response = '') => ({ status, response, actor: req.owner?._id || req.resident._id,
  actorRole: req.owner ? 'owner' : 'resident', actorName: req.owner?.name || req.resident.fullName });
const eventView = (event) => ({ id: event._id, status: event.status, response: event.response,
  actor: { id: event.actor, role: event.actorRole, name: event.actorName }, createdAt: event.createdAt });
const view = (request) => ({
  id: request._id, pgId: request.owner, resident: { id: request.resident, fullName: request.residentName },
  room: { id: request.room, roomNumber: request.roomNumber }, fromDate: request.fromDate, toDate: request.toDate,
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
async function activeResident(req, session) {
  const resident = await Resident.findOne({ _id: req.resident._id, owner: req.resident.owner, status: 'Active', loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false, sessionVersion: req.resident.sessionVersion }).session(session);
  if (!resident) throw new ApiError(401, 'Your session has expired. Please log in again');
  return resident;
}
async function ownedRequest(req, session) {
  const query = LeaveRequest.findOne({ _id: req.params.id, ...scopeFor(req) });
  if (session) query.session(session).select('+notificationEvents');
  const request = await query;
  if (!request) throw new ApiError(404, 'Leave request not found');
  return request;
}
async function overlap(owner, resident, fromDate, toDate, session, except) {
  return LeaveRequest.exists({ owner, resident, status: { $in: ACTIVE_LEAVE_STATUSES },
    fromDate: { $lte: toDate }, toDate: { $gte: fromDate }, ...(except && { _id: { $ne: except } }) }).session(session);
}

export const createLeaveRequest = asyncHandler(async (req, res) => {
  const request = await scheduleTransaction(req.resident.owner, req.resident._id, async (session) => {
    const resident = await activeResident(req, session);
    if (req.body.fromDate < todayIST()) throw new ApiError(400, 'Leave cannot start before today in India');
    if (await overlap(resident.owner, resident._id, req.body.fromDate, req.body.toDate, session)) throw new ApiError(409, 'These dates overlap an existing Pending or Approved leave request');
    const room = await Room.findOne({ _id: resident.room, owner: resident.owner }).select('roomNumber').session(session);
    if (!room) throw new ApiError(409, 'Your room assignment is no longer available');
    const request = new LeaveRequest({ owner: resident.owner, resident: resident._id, residentName: resident.fullName,
      room: room._id, roomNumber: room.roomNumber, fromDate: req.body.fromDate, toDate: req.body.toDate,
      durationDays: leaveDurationDays(req.body.fromDate, req.body.toDate), reason: req.body.reason,
      emergencyContact: req.body.emergencyContact || '', history: [eventFor(req, 'Pending')] });
    request.notificationEvents = [notificationEvent('leave_requested', request._id, request.owner,
      'New leave request', `${request.residentName} requested leave from ${request.fromDate} to ${request.toDate}.`, request.history[0]._id)];
    await request.save({ session });
    return request;
  });
  await tryDeliverNotifications(request.owner);
  res.status(201).json({ success: true, message: 'Leave request submitted', ...mutationResult(request) });
});
export const listLeaveRequests = asyncHandler(async (req, res) => {
  const scope = scopeFor(req), page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  if (req.query.status) scope.status = req.query.status;
  if (req.owner && req.query.resident) scope.resident = req.query.resident;
  if (req.query.date && (req.query.fromDate || req.query.toDate)) throw new ApiError(400, 'Use a single date or a date range');
  if (req.query.fromDate && req.query.toDate && req.query.fromDate > req.query.toDate) throw new ApiError(400, 'From date must be on or before to date');
  const from = req.query.date || req.query.fromDate, to = req.query.date || req.query.toDate;
  if (from) scope.toDate = { $gte: from };
  if (to) scope.fromDate = { $lte: to };
  const [requests, total] = await Promise.all([
    LeaveRequest.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LeaveRequest.countDocuments(scope),
  ]);
  res.json({ success: true, count: requests.length, data: { requests: requests.map(view), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } });
});
export const getLeaveRequest = asyncHandler(async (req, res) => {
  res.json({ success: true, data: view(await ownedRequest(req)) });
});
export const cancelLeaveRequest = asyncHandler(async (req, res) => {
  const request = await scheduleTransaction(req.resident.owner, req.resident._id, async (session) => {
    await activeResident(req, session);
    const request = await ownedRequest(req, session);
    if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending leave requests can be cancelled');
    request.status = 'Cancelled'; request.cancelledAt = new Date(); request.history.push(eventFor(req, 'Cancelled'));
    await request.save({ session }); return request;
  });
  res.json({ success: true, message: 'Leave request cancelled', ...mutationResult(request) });
});
export const decideLeaveRequest = asyncHandler(async (req, res) => {
  const target = await ownedRequest(req);
  const request = await scheduleTransaction(req.owner._id, target.resident, async (session) => {
    const request = await ownedRequest(req, session);
    if (request.status !== 'Pending') throw new ApiError(409, 'This leave request has already been finalized');
    if (req.body.decision === 'Approved' && await overlap(request.owner, request.resident, request.fromDate, request.toDate, session, request._id)) throw new ApiError(409, 'These dates overlap another active leave request');
    request.status = req.body.decision; request.response = req.body.response || ''; request.decidedAt = new Date();
    request.history.push(eventFor(req, request.status, request.response));
    (request.notificationEvents ||= []).push(notificationEvent(`leave_${request.status.toLowerCase()}`, request._id, request.resident,
      `Leave request ${request.status.toLowerCase()}`, `Your leave from ${request.fromDate} to ${request.toDate} was ${request.status.toLowerCase()}.`, request.history.at(-1)._id));
    await request.save({ session }); return request;
  });
  await tryDeliverNotifications(request.owner);
  res.json({ success: true, message: `Leave request ${request.status.toLowerCase()}`, ...mutationResult(request) });
});
