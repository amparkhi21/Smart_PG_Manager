import mongoose from 'mongoose';
import GeneralRequest from '../models/GeneralRequest.js';
import { GENERAL_REQUEST_CATEGORIES, GENERAL_REQUEST_PRIORITIES, GENERAL_REQUEST_STATUSES } from '../constants.js';
import PaymentClaim from '../models/PaymentClaim.js';
import RoomChangeRequest from '../models/RoomChangeRequest.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Complaint from '../models/Complaint.js';
import ComplaintEvent from '../models/ComplaintEvent.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';

const SOURCES = ['payment', 'room-change', 'leave', 'general', 'complaint'];
const timestampSort = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b.sourceId).localeCompare(String(a.sourceId));
const stable = (sourceType, id) => `${sourceType}:${id}`;

function normalize(sourceType, item) {
  if (sourceType === 'payment') return {
    id: stable(sourceType, item._id), sourceType, sourceId: String(item._id), category: 'Payment Verification',
    title: `${item.billType} payment · ${item.month}`, description: `Claimed ${item.amount} against ${item.billType} bill. UTR: ${item.utr}`,
    priority: 'Normal', status: item.status, createdAt: item.createdAt, ownerResponse: item.reviewNote || '',
    resident: { id: item.resident?._id || item.resident, name: item.resident?.fullName || 'Resident unavailable' },
    room: { id: item.room?._id || item.room, number: item.room?.roomNumber || '—', bedNumber: item.resident?.bedNumber || null },
    details: { billType: item.billType, month: item.month, amount: item.amount, utr: item.utr, paymentDate: item.paymentDate,
      bill: item.bill ? { balance: item.bill.balance, amountPaid: item.bill.amountPaid } : null },
  };
  if (sourceType === 'room-change') return {
    id: stable(sourceType, item._id), sourceType, sourceId: String(item._id), category: 'Room / Bed Change',
    title: `Move to room ${item.toRoomNumber}${item.toBedNumber ? ` · bed ${item.toBedNumber}` : ''}`,
    description: item.reason, priority: 'Normal', status: item.status, createdAt: item.createdAt,
    ownerResponse: item.decisionNote || '', resident: { id: item.resident, name: item.residentName || 'Resident unavailable' },
    room: { number: item.fromRoomNumber, bedNumber: item.fromBedNumber || null },
    details: { fromRoom: item.fromRoomNumber, fromBed: item.fromBedNumber || null, toRoom: item.toRoomNumber, toBed: item.toBedNumber || null },
  };
  if (sourceType === 'leave') return {
    id: stable(sourceType, item._id), sourceType, sourceId: String(item._id), category: 'Leave Request',
    title: `Leave · ${item.fromDate} to ${item.toDate}`, description: item.reason, priority: 'Normal', status: item.status,
    createdAt: item.createdAt, ownerResponse: item.response || '', resident: { id: item.resident, name: item.residentName || 'Resident unavailable' },
    room: { id: item.room, number: item.roomNumber, bedNumber: item.bedNumber || null },
    details: { fromDate: item.fromDate, toDate: item.toDate, durationDays: item.durationDays, emergencyContact: item.emergencyContact || null },
  };
  if (sourceType === 'complaint') return {
    id: stable(sourceType, item._id), sourceType, sourceId: String(item._id), category: 'Private Issue',
    title: item.title, description: item.description, priority: item.priority === 'Medium' ? 'Normal' : item.priority,
    status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt, ownerResponse: item.resolutionNote || '',
    resident: { id: item.resident, name: item.residentName || 'Resident unavailable' },
    room: { id: item.room, number: item.roomNumber || item.residentRoomNumber || '—', bedNumber: null },
    details: { originalCategory: item.category, resolvedAt: item.resolvedAt, reopenedAt: item.reopenedAt },
  };
  return {
    id: stable(sourceType, item._id), sourceType, sourceId: String(item._id), category: item.category,
    title: item.title, description: item.description, priority: item.priority, status: item.status,
    createdAt: item.createdAt, updatedAt: item.updatedAt, ownerResponse: item.responses?.at(-1)?.message || '',
    responses: (item.responses || []).map((entry) => ({ ownerName: entry.ownerName, message: entry.message, createdAt: entry.createdAt })),
    resident: { id: item.resident, name: item.residentName || 'Resident unavailable' },
    room: { id: item.room, number: item.roomNumber, bedNumber: item.bedNumber || null },
    details: {},
  };
}

function scopeFor(context) {
  return context.owner
    ? { owner: context.owner._id, ...(context.filters.resident && { resident: context.filters.resident }) }
    : { owner: context.resident.owner, resident: context.resident._id };
}

function categorySources(category) {
  if (!category) return SOURCES;
  if (category === 'Payment Verification') return ['payment'];
  if (category === 'Room / Bed Change') return ['room-change'];
  if (category === 'Leave Request') return ['leave'];
  if (category === 'Private Issue') return ['general', 'complaint'];
  if (GENERAL_REQUEST_CATEGORIES.includes(category)) return ['general'];
  return [];
}

function statusMatches(model, requested) {
  if (!requested) return true;
  const supported = model === 'payment' ? ['Pending Verification', 'Approved', 'Rejected', 'Cancelled']
    : model === 'room-change' ? ['Pending', 'Approved', 'Rejected', 'Cancelled']
      : model === 'leave' ? ['Pending', 'Approved', 'Rejected', 'Cancelled']
        : model === 'complaint' ? ['Open', 'In Progress', 'Resolved'] : GENERAL_REQUEST_STATUSES;
  return supported.includes(requested);
}

async function readRequests(context, page, limit) {
  const base = scopeFor(context), category = context.filters.category, status = context.filters.status, priority = context.filters.priority;
  const sources = categorySources(category).filter((source) => source !== 'general' || !priority || GENERAL_REQUEST_PRIORITIES.includes(priority));
  const amount = page * limit;
  const specs = {
    payment: { Model: PaymentClaim, category: 'Payment Verification', filter: { ...base }, populate: [['resident', 'fullName bedNumber'], ['room', 'roomNumber']] },
    'room-change': { Model: RoomChangeRequest, category: 'Room / Bed Change', filter: { ...base } },
    leave: { Model: LeaveRequest, category: 'Leave Request', filter: { ...base } },
    general: { Model: GeneralRequest, category: 'general', filter: { ...base } },
    complaint: { Model: Complaint, category: 'Private Issue', filter: { ...base } },
  };
  const selected = sources.filter((source) => {
    if (!statusMatches(source, status)) return false;
    if (priority && ['payment', 'room-change', 'leave'].includes(source) && priority !== 'Normal') return false;
    if (source === 'general' && category && !GENERAL_REQUEST_CATEGORIES.includes(category)) return false;
    if (source === 'complaint' && category && category !== 'Private Issue') return false;
    return true;
  });
  const results = await Promise.all(selected.map(async (source) => {
    const spec = specs[source], filter = { ...spec.filter };
    if (status) filter.status = status;
    if (source === 'general' && priority) filter.priority = priority;
    if (source === 'complaint' && priority) filter.priority = priority === 'Normal' ? 'Medium' : priority;
    let query = spec.Model.find(filter).sort({ createdAt: -1, _id: -1 }).limit(amount).lean();
    for (const [path, fields] of spec.populate || []) query = query.populate(path, fields);
    const [rows, total] = await Promise.all([query, spec.Model.countDocuments(filter)]);
    return { items: rows.map((item) => normalize(source, item)), total };
  }));
  const all = results.flatMap((result) => result.items).sort(timestampSort);
  const total = results.reduce((sum, result) => sum + result.total, 0);
  return { requests: all.slice((page - 1) * limit, page * limit), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } };
}

export const listUnifiedRequests = async (context) => {
  const page = Number(context.filters.page || 1), limit = Number(context.filters.limit || 20);
  const data = await readRequests(context, page, limit);
  return { count: data.requests.length, data };
};

export const getUnifiedRequest = async (context) => {
  const { sourceType, id } = context.identifiers;
  if (!SOURCES.includes(sourceType) || !mongoose.isValidObjectId(id)) throw new ApiError(404, 'Request not found');
  const scope = scopeFor(context), filter = { _id: id, owner: scope.owner, ...(context.resident && { resident: context.resident._id }) };
  const Model = ({ payment: PaymentClaim, 'room-change': RoomChangeRequest, leave: LeaveRequest, general: GeneralRequest, complaint: Complaint })[sourceType];
  let query = Model.findOne(filter).lean();
  if (sourceType === 'payment') query = query.populate('resident', 'fullName bedNumber').populate('room', 'roomNumber');
  const item = await query;
  if (!item) throw new ApiError(404, 'Request not found');
  const normalized = normalize(sourceType, item);
  if (sourceType === 'complaint') {
    const page = Number(context.filters.historyPage || 1), limit = Number(context.filters.historyLimit || 20);
    const eventScope = { owner: scope.owner, complaint: item._id, resident: item.resident };
    const [events, total] = await Promise.all([
      ComplaintEvent.find(eventScope).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      ComplaintEvent.countDocuments(eventScope),
    ]);
    normalized.responses = events.map((event) => ({ ownerName: event.actorName, actorRole: event.actorRole,
      type: event.type, message: event.text || (event.toStatus ? `Status: ${event.fromStatus || 'New'} → ${event.toStatus}` : ''), createdAt: event.createdAt }));
    normalized.historyPagination = { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total };
  }
  return { data: normalized };
};

export const createGeneralRequest = async (context) => {
  const resident = await Resident.findOne({ _id: context.resident._id, owner: context.resident.owner, status: 'Active' });
  if (!resident || !resident.loginEnabled || resident.accountStatus !== 'active' || resident.passwordChangeRequired
      || resident.sessionVersion !== context.resident.sessionVersion) throw new ApiError(401, 'Your session has expired. Please log in again');
  const room = await Room.findOne({ _id: resident.room, owner: resident.owner }).select('roomNumber');
  if (!room) throw new ApiError(409, 'Your room assignment is no longer available');
  const request = await GeneralRequest.create({ owner: resident.owner, resident: resident._id, residentName: resident.fullName,
    room: room._id, roomNumber: room.roomNumber, bedNumber: resident.bedNumber || null,
    category: context.input.category, title: context.input.title, description: context.input.description, priority: context.input.priority || 'Normal' });
  return { message: 'Request submitted', data: normalize('general', request.toObject()) };
};

export const updateGeneralRequest = async (context) => {
  const request = await GeneralRequest.findOne({ _id: context.identifiers.id, owner: context.owner._id });
  if (!request) throw new ApiError(404, 'Request not found');
  if (['Resolved', 'Rejected', 'Cancelled'].includes(request.status)) throw new ApiError(409, 'This request is already closed');
  if (context.input.response) request.responses.push({ owner: context.owner._id, ownerName: context.owner.name, message: context.input.response });
  if (context.input.status) {
    request.status = context.input.status;
    if (context.input.status === 'Resolved') request.resolvedAt = new Date();
  }
  await request.save();
  return { message: 'Request updated', data: normalize('general', request.toObject()) };
};

export const cancelGeneralRequest = async (context) => {
  const request = await GeneralRequest.findOne({ _id: context.identifiers.id, owner: context.resident.owner, resident: context.resident._id });
  if (!request) throw new ApiError(404, 'Request not found');
  if (request.status !== 'Open') throw new ApiError(409, 'Only open requests can be cancelled');
  request.status = 'Cancelled'; request.cancelledAt = new Date();
  await request.save();
  return { message: 'Request cancelled', data: normalize('general', request.toObject()) };
};
