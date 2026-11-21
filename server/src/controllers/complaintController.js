import mongoose from 'mongoose';
import Complaint from '../models/Complaint.js';
import ComplaintEvent from '../models/ComplaintEvent.js';
import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from '../utils/notifications.js';

const scopeFor = (req) => req.owner ? { owner: req.owner._id } : { owner: req.resident.owner, resident: req.resident._id };
const actorFor = (req) => req.owner ? { actor: req.owner._id, actorRole: 'owner', actorName: req.owner.name }
  : { actor: req.resident._id, actorRole: 'resident', actorName: req.resident.fullName };
const pagination = (req) => ({ page: Number(req.query.page || 1), limit: Number(req.query.limit || 20) });
const pageView = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total });
const view = (complaint) => ({
  id: complaint._id, pgId: complaint.owner,
  resident: { id: complaint.resident, fullName: complaint.residentName, roomNumberAtCreation: complaint.residentRoomNumber },
  room: complaint.room ? { id: complaint.room, roomNumber: complaint.roomNumber } : null,
  title: complaint.title, description: complaint.description, category: complaint.category, priority: complaint.priority,
  status: complaint.status, resolutionNote: complaint.resolutionNote, resolvedAt: complaint.resolvedAt,
  reopenedAt: complaint.reopenedAt, createdAt: complaint.createdAt, updatedAt: complaint.updatedAt, lastActivityAt: complaint.lastActivityAt,
});
const eventView = (event) => ({
  id: event._id, complaintId: event.complaint, pgId: event.owner, residentId: event.resident,
  actor: { id: event.actor, role: event.actorRole, name: event.actorName }, type: event.type,
  text: event.text, fromStatus: event.fromStatus || null, toStatus: event.toStatus || null, createdAt: event.createdAt,
});
async function ownedComplaint(req, session) {
  const query = Complaint.findOne({ _id: req.params.id, ...scopeFor(req) });
  if (session) query.session(session);
  const complaint = await query;
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  return complaint;
}
async function checkResident(req, session) {
  if (!req.resident) return;
  const resident = await Resident.exists({ _id: req.resident._id, owner: req.resident.owner, status: 'Active', loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false, sessionVersion: req.resident.sessionVersion }).session(session);
  if (!resident) throw new ApiError(401, 'Your session has expired. Please log in again');
}
async function appendEvent(req, complaint, fields, session) {
  const event = new ComplaintEvent({ owner: complaint.owner, resident: complaint.resident, complaint: complaint._id,
    ...actorFor(req), ...fields });
  let notification;
  if (fields.type === 'Created') notification = notificationEvent('complaint_created', complaint._id, complaint.owner,
    'New resident complaint', `${complaint.residentName} submitted a complaint: ${complaint.title}`, event._id);
  else if (req.owner && fields.type === 'Status Changed') notification = notificationEvent('complaint_status_updated', complaint._id, complaint.resident,
    'Complaint status updated', `Your complaint "${complaint.title}" is now ${complaint.status}.`, event._id);
  else if (req.owner && fields.type === 'Comment') notification = notificationEvent('complaint_response', complaint._id, complaint.resident,
    'Owner responded to your complaint', `Your PG owner responded to your complaint "${complaint.title}".`, event._id);
  if (notification) event.notificationEvents = [notification];
  await event.save({ session });
  return event;
}
// Complaint changes, private audit records and pending notifications commit together.
const transact = (work) => mongoose.connection.transaction(work, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

export const createComplaint = asyncHandler(async (req, res) => {
  const result = await transact(async (session) => {
    await checkResident(req, session);
    let room = null;
    if (req.body.room) {
      room = await Room.findOne({ _id: req.body.room, owner: req.resident.owner }).select('roomNumber').session(session);
      if (!room) throw new ApiError(404, 'Room not found');
    }
    const [complaint] = await Complaint.create([{ owner: req.resident.owner, resident: req.resident._id, residentName: req.resident.fullName,
      residentRoomNumber: req.residentRoom.roomNumber, room: room?._id || null, roomNumber: room?.roomNumber || null,
      title: req.body.title, description: req.body.description, category: req.body.category, priority: req.body.priority }], { session });
    const event = await appendEvent(req, complaint, { type: 'Created', toStatus: 'Open' }, session);
    return { complaint, event };
  });
  await tryDeliverNotifications(result.complaint.owner);
  res.status(201).json({ success: true, message: 'Complaint submitted privately to your PG owner', data: view(result.complaint), event: eventView(result.event) });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const scope = scopeFor(req), { page, limit } = pagination(req);
  for (const field of ['status', 'category', 'priority']) if (req.query[field]) scope[field] = req.query[field];
  if (req.owner && req.query.resident) scope.resident = req.query.resident;
  const [complaints, total] = await Promise.all([
    Complaint.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Complaint.countDocuments(scope),
  ]);
  res.json({ success: true, count: complaints.length, data: { complaints: complaints.map(view), pagination: pageView(page, limit, total) } });
});
export const getComplaint = asyncHandler(async (req, res) => {
  res.json({ success: true, data: view(await ownedComplaint(req)) });
});
export const getComplaintHistory = asyncHandler(async (req, res) => {
  const complaint = await ownedComplaint(req), { page, limit } = pagination(req);
  const scope = { owner: complaint.owner, complaint: complaint._id, resident: complaint.resident };
  const [events, total] = await Promise.all([
    ComplaintEvent.find(scope).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ComplaintEvent.countDocuments(scope),
  ]);
  res.json({ success: true, count: events.length, data: { events: events.map(eventView), pagination: pageView(page, limit, total) } });
});
export const addComplaintComment = asyncHandler(async (req, res) => {
  const result = await transact(async (session) => {
    await checkResident(req, session);
    const complaint = await ownedComplaint(req, session);
    complaint.lastActivityAt = new Date(); await complaint.save({ session });
    const event = await appendEvent(req, complaint, { type: 'Comment', text: req.body.text }, session);
    return { complaint, event };
  });
  if (req.owner) await tryDeliverNotifications(result.complaint.owner);
  res.status(201).json({ success: true, message: 'Comment added', data: view(result.complaint), event: eventView(result.event) });
});
export const updateComplaintStatus = asyncHandler(async (req, res) => {
  const result = await transact(async (session) => {
    const complaint = await ownedComplaint(req, session), fromStatus = complaint.status;
    if (fromStatus === req.body.status) throw new ApiError(409, 'Complaint already has this status');
    if (req.body.status !== 'Resolved' && req.body.resolutionNote) throw new ApiError(400, 'Resolution notes belong to a Resolved status');
    complaint.status = req.body.status; complaint.lastActivityAt = new Date();
    if (complaint.status === 'Resolved') { complaint.resolvedAt = new Date(); complaint.resolutionNote = req.body.resolutionNote || ''; }
    else { complaint.resolvedAt = null; complaint.resolutionNote = ''; if (fromStatus === 'Resolved') complaint.reopenedAt = new Date(); }
    await complaint.save({ session });
    const event = await appendEvent(req, complaint, { type: 'Status Changed', fromStatus, toStatus: complaint.status, text: req.body.resolutionNote || '' }, session);
    return { complaint, event };
  });
  await tryDeliverNotifications(result.complaint.owner);
  res.json({ success: true, message: 'Complaint status updated', data: view(result.complaint), event: eventView(result.event) });
});
export const reopenComplaint = asyncHandler(async (req, res) => {
  const result = await transact(async (session) => {
    await checkResident(req, session);
    const complaint = await ownedComplaint(req, session);
    if (complaint.status !== 'Resolved') throw new ApiError(409, 'Only a resolved complaint can be reopened');
    complaint.status = 'Open'; complaint.reopenedAt = new Date(); complaint.lastActivityAt = new Date();
    complaint.resolvedAt = null; complaint.resolutionNote = ''; await complaint.save({ session });
    const event = await appendEvent(req, complaint, { type: 'Reopened', fromStatus: 'Resolved', toStatus: 'Open', text: req.body.text || '' }, session);
    return { complaint, event };
  });
  res.json({ success: true, message: 'Complaint reopened', data: view(result.complaint), event: eventView(result.event) });
});
