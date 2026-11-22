import mongoose from 'mongoose';
import GeneralRequest, { GENERAL_REQUEST_CATEGORIES, GENERAL_REQUEST_PRIORITIES, GENERAL_REQUEST_STATUSES } from '../models/GeneralRequest.js';
import PaymentClaim from '../models/PaymentClaim.js';
import RoomChangeRequest from '../models/RoomChangeRequest.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Complaint from '../models/Complaint.js';
import ComplaintEvent from '../models/ComplaintEvent.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const REQUEST_CATEGORIES = ['Payment Verification', 'Room / Bed Change', 'Leave Request', ...GENERAL_REQUEST_CATEGORIES];
export const REQUEST_STATUSES = [...new Set(['Pending Verification', 'Pending', ...GENERAL_REQUEST_STATUSES, 'Approved', 'Rejected', 'Cancelled'])];
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

function scopeFor(req) {
  return req.owner
    ? { owner: req.owner._id, ...(req.query.resident && { resident: req.query.resident }) }
    : { owner: req.resident.owner, resident: req.resident._id };
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

async function readRequests(req, page, limit) {
  const base = scopeFor(req), category = req.query.category, status = req.query.status, priority = req.query.priority;
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

export const listUnifiedRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  const data = await readRequests(req, page, limit);
  res.json({ success: true, count: data.requests.length, data });
});

export const getUnifiedRequest = asyncHandler(async (req, res) => {
  const { sourceType, id } = req.params;
  if (!SOURCES.includes(sourceType) || !mongoose.isValidObjectId(id)) throw new ApiError(404, 'Request not found');
  const scope = scopeFor(req), filter = { _id: id, owner: scope.owner, ...(req.resident && { resident: req.resident._id }) };
  const Model = ({ payment: PaymentClaim, 'room-change': RoomChangeRequest, leave: LeaveRequest, general: GeneralRequest, complaint: Complaint })[sourceType];
  let query = Model.findOne(filter).lean();
  if (sourceType === 'payment') query = query.populate('resident', 'fullName bedNumber').populate('room', 'roomNumber');
  const item = await query;
  if (!item) throw new ApiError(404, 'Request not found');
  const normalized = normalize(sourceType, item);
  if (sourceType === 'complaint') {
    const page = Number(req.query.historyPage || 1), limit = Number(req.query.historyLimit || 20);
    const eventScope = { owner: scope.owner, complaint: item._id, resident: item.resident };
    const [events, total] = await Promise.all([
      ComplaintEvent.find(eventScope).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      ComplaintEvent.countDocuments(eventScope),
    ]);
    normalized.responses = events.map((event) => ({ ownerName: event.actorName, actorRole: event.actorRole,
      type: event.type, message: event.text || (event.toStatus ? `Status: ${event.fromStatus || 'New'} → ${event.toStatus}` : ''), createdAt: event.createdAt }));
    normalized.historyPagination = { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total };
  }
  res.json({ success: true, data: normalized });
});

export const createGeneralRequest = asyncHandler(async (req, res) => {
  const resident = await Resident.findOne({ _id: req.resident._id, owner: req.resident.owner, status: 'Active' });
  if (!resident || !resident.loginEnabled || resident.accountStatus !== 'active' || resident.passwordChangeRequired
      || resident.sessionVersion !== req.resident.sessionVersion) throw new ApiError(401, 'Your session has expired. Please log in again');
  const room = await Room.findOne({ _id: resident.room, owner: resident.owner }).select('roomNumber');
  if (!room) throw new ApiError(409, 'Your room assignment is no longer available');
  const request = await GeneralRequest.create({ owner: resident.owner, resident: resident._id, residentName: resident.fullName,
    room: room._id, roomNumber: room.roomNumber, bedNumber: resident.bedNumber || null,
    category: req.body.category, title: req.body.title, description: req.body.description, priority: req.body.priority || 'Normal' });
  res.status(201).json({ success: true, message: 'Request submitted', data: normalize('general', request.toObject()) });
});

export const updateGeneralRequest = asyncHandler(async (req, res) => {
  const request = await GeneralRequest.findOne({ _id: req.params.id, owner: req.owner._id });
  if (!request) throw new ApiError(404, 'Request not found');
  if (['Resolved', 'Rejected', 'Cancelled'].includes(request.status)) throw new ApiError(409, 'This request is already closed');
  if (req.body.response) request.responses.push({ owner: req.owner._id, ownerName: req.owner.name, message: req.body.response });
  if (req.body.status) {
    request.status = req.body.status;
    if (req.body.status === 'Resolved') request.resolvedAt = new Date();
  }
  await request.save();
  res.json({ success: true, message: 'Request updated', data: normalize('general', request.toObject()) });
});

export const cancelGeneralRequest = asyncHandler(async (req, res) => {
  const request = await GeneralRequest.findOne({ _id: req.params.id, owner: req.resident.owner, resident: req.resident._id });
  if (!request) throw new ApiError(404, 'Request not found');
  if (request.status !== 'Open') throw new ApiError(409, 'Only open requests can be cancelled');
  request.status = 'Cancelled'; request.cancelledAt = new Date();
  await request.save();
  res.json({ success: true, message: 'Request cancelled', data: normalize('general', request.toObject()) });
});

export const validateRequestQuery = (query) => [
  query('page').optional().isInt({ min: 1, max: 100 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().isIn(REQUEST_CATEGORIES),
  query('status').optional().isIn(REQUEST_STATUSES),
  query('priority').optional().isIn(GENERAL_REQUEST_PRIORITIES),
  query('resident').optional().isMongoId(),
];

export const validateRequestOwnerBody = (body) => [
  body('response').optional({ values: 'falsy' }).isString().trim().isLength({ min: 1, max: 2000 }),
  body('status').optional().isIn(['Open', 'In Progress', 'Resolved', 'Rejected']),
  body().custom((value) => Boolean(value.response || value.status)).withMessage('Add a reply or choose a status'),
];

export const validateGeneralRequestBody = (body) => [
  body('category').isIn(GENERAL_REQUEST_CATEGORIES),
  body('title').isString().bail().trim().isLength({ min: 3, max: 120 }),
  body('description').isString().bail().trim().isLength({ min: 5, max: 3000 }),
  body('priority').optional().isIn(GENERAL_REQUEST_PRIORITIES),
];
