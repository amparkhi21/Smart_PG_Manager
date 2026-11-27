import mongoose from 'mongoose';
import Complaint from '../models/Complaint.js';
import ComplaintEvent from '../models/ComplaintEvent.js';
import Room from '../models/Room.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';

import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from './notificationDeliveryService.js';

const scopeFor = (context) => context.owner ? { owner: context.owner._id } : { owner: context.resident.owner, resident: context.resident._id };
const actorFor = (context) => context.owner ? { actor: context.owner._id, actorRole: 'owner', actorName: context.owner.name }
  : { actor: context.resident._id, actorRole: 'resident', actorName: context.resident.fullName };
const pagination = (context) => ({ page: Number(context.filters.page || 1), limit: Number(context.filters.limit || 20) });
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
async function ownedComplaint(context, session) {
  const query = Complaint.findOne({ _id: context.identifiers.id, ...scopeFor(context) });
  if (session) query.session(session);
  const complaint = await query;
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  return complaint;
}
async function checkResident(context, session) {
  if (!context.resident) return;
  const resident = await Resident.exists({ _id: context.resident._id, owner: context.resident.owner, status: 'Active', loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false, sessionVersion: context.resident.sessionVersion }).session(session);
  if (!resident) throw new ApiError(401, 'Your session has expired. Please log in again');
}
async function appendEvent(context, complaint, fields, session) {
  const event = new ComplaintEvent({ owner: complaint.owner, resident: complaint.resident, complaint: complaint._id,
    ...actorFor(context), ...fields });
  let notification;
  if (fields.type === 'Created') notification = notificationEvent('complaint_created', complaint._id, complaint.owner,
    'New resident complaint', `${complaint.residentName} submitted a complaint: ${complaint.title}`, event._id);
  else if (context.owner && fields.type === 'Status Changed') notification = notificationEvent('complaint_status_updated', complaint._id, complaint.resident,
    'Complaint status updated', `Your complaint "${complaint.title}" is now ${complaint.status}.`, event._id);
  else if (context.owner && fields.type === 'Comment') notification = notificationEvent('complaint_response', complaint._id, complaint.resident,
    'Owner responded to your complaint', `Your PG owner responded to your complaint "${complaint.title}".`, event._id);
  if (notification) event.notificationEvents = [notification];
  await event.save({ session });
  return event;
}
// Complaint changes, private audit records and pending notifications commit together.
const transact = (work) => mongoose.connection.transaction(work, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

export const createComplaint = async (context) => {
  const result = await transact(async (session) => {
    await checkResident(context, session);
    let room = null;
    if (context.input.room) {
      room = await Room.findOne({ _id: context.input.room, owner: context.resident.owner }).select('roomNumber').session(session);
      if (!room) throw new ApiError(404, 'Room not found');
    }
    const [complaint] = await Complaint.create([{ owner: context.resident.owner, resident: context.resident._id, residentName: context.resident.fullName,
      residentRoomNumber: context.residentRoom.roomNumber, room: room?._id || null, roomNumber: room?.roomNumber || null,
      title: context.input.title, description: context.input.description, category: context.input.category, priority: context.input.priority }], { session });
    const event = await appendEvent(context, complaint, { type: 'Created', toStatus: 'Open' }, session);
    return { complaint, event };
  });
  await tryDeliverNotifications(result.complaint.owner);
  return { message: 'Complaint submitted privately to your PG owner', data: view(result.complaint), event: eventView(result.event) };
};

export const listComplaints = async (context) => {
  const scope = scopeFor(context), { page, limit } = pagination(context);
  for (const field of ['status', 'category', 'priority']) if (context.filters[field]) scope[field] = context.filters[field];
  if (context.owner && context.filters.resident) scope.resident = context.filters.resident;
  const [complaints, total] = await Promise.all([
    Complaint.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Complaint.countDocuments(scope),
  ]);
  return { count: complaints.length, data: { complaints: complaints.map(view), pagination: pageView(page, limit, total) } };
};
export const getComplaint = async (context) => {
  return { data: view(await ownedComplaint(context)) };
};
export const getComplaintHistory = async (context) => {
  const complaint = await ownedComplaint(context), { page, limit } = pagination(context);
  const scope = { owner: complaint.owner, complaint: complaint._id, resident: complaint.resident };
  const [events, total] = await Promise.all([
    ComplaintEvent.find(scope).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ComplaintEvent.countDocuments(scope),
  ]);
  return { count: events.length, data: { events: events.map(eventView), pagination: pageView(page, limit, total) } };
};
export const addComplaintComment = async (context) => {
  const result = await transact(async (session) => {
    await checkResident(context, session);
    const complaint = await ownedComplaint(context, session);
    complaint.lastActivityAt = new Date(); await complaint.save({ session });
    const event = await appendEvent(context, complaint, { type: 'Comment', text: context.input.text }, session);
    return { complaint, event };
  });
  if (context.owner) await tryDeliverNotifications(result.complaint.owner);
  return { message: 'Comment added', data: view(result.complaint), event: eventView(result.event) };
};
export const updateComplaintStatus = async (context) => {
  const result = await transact(async (session) => {
    const complaint = await ownedComplaint(context, session), fromStatus = complaint.status;
    if (fromStatus === context.input.status) throw new ApiError(409, 'Complaint already has this status');
    if (context.input.status !== 'Resolved' && context.input.resolutionNote) throw new ApiError(400, 'Resolution notes belong to a Resolved status');
    complaint.status = context.input.status; complaint.lastActivityAt = new Date();
    if (complaint.status === 'Resolved') { complaint.resolvedAt = new Date(); complaint.resolutionNote = context.input.resolutionNote || ''; }
    else { complaint.resolvedAt = null; complaint.resolutionNote = ''; if (fromStatus === 'Resolved') complaint.reopenedAt = new Date(); }
    await complaint.save({ session });
    const event = await appendEvent(context, complaint, { type: 'Status Changed', fromStatus, toStatus: complaint.status, text: context.input.resolutionNote || '' }, session);
    return { complaint, event };
  });
  await tryDeliverNotifications(result.complaint.owner);
  return { message: 'Complaint status updated', data: view(result.complaint), event: eventView(result.event) };
};
export const reopenComplaint = async (context) => {
  const result = await transact(async (session) => {
    await checkResident(context, session);
    const complaint = await ownedComplaint(context, session);
    if (complaint.status !== 'Resolved') throw new ApiError(409, 'Only a resolved complaint can be reopened');
    complaint.status = 'Open'; complaint.reopenedAt = new Date(); complaint.lastActivityAt = new Date();
    complaint.resolvedAt = null; complaint.resolutionNote = ''; await complaint.save({ session });
    const event = await appendEvent(context, complaint, { type: 'Reopened', fromStatus: 'Resolved', toStatus: 'Open', text: context.input.text || '' }, session);
    return { complaint, event };
  });
  return { message: 'Complaint reopened', data: view(result.complaint), event: eventView(result.event) };
};
