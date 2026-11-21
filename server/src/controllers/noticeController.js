import Notice from '../models/Notice.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from '../utils/notifications.js';

const view = (notice, req, now = new Date()) => ({
  id: notice._id, pgId: notice.owner, title: notice.title, body: notice.body, pinned: notice.pinned,
  expiresAt: notice.expiresAt, createdAt: notice.createdAt, updatedAt: notice.updatedAt,
  isExpired: Boolean(notice.expiresAt && notice.expiresAt <= now),
  isNew: req.communityMember.role === 'resident' && (!req.resident.noticeSeenAt || notice.updatedAt > req.resident.noticeSeenAt),
});
const requireOwner = (req) => { if (req.communityMember.role !== 'owner') throw new ApiError(403, 'Only the owner can manage notices'); };
async function ownedNotice(req) {
  const notice = await Notice.findOne({ _id: req.params.id, owner: req.communityMember.pgId });
  if (!notice) throw new ApiError(404, 'Notice not found');
  return notice;
}
export const listNotices = asyncHandler(async (req, res) => {
  const now = new Date(), scope = { owner: req.communityMember.pgId };
  if (req.communityMember.role === 'resident') scope.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
  const notices = await Notice.find(scope).sort({ pinned: -1, createdAt: -1, _id: -1 }).lean();
  res.json({ success: true, count: notices.length, data: { pgId: req.communityMember.pgId,
    notices: notices.map((notice) => view(notice, req, now)), readThrough: now.toISOString() } });
});
export const createNotice = asyncHandler(async (req, res) => {
  requireOwner(req);
  const notice = new Notice({ owner: req.communityMember.pgId, title: req.body.title, body: req.body.body,
    pinned: req.body.pinned, expiresAt: req.body.expiresAt });
  if (!notice.expiresAt || notice.expiresAt > new Date()) {
    const residents = await Resident.find({ owner: notice.owner, status: 'Active', loginEnabled: true, accountStatus: 'active' }).select('_id').lean();
    const event = notificationEvent('notice_published', notice._id, residents.map((resident) => resident._id),
      `New PG notice: ${notice.title}`, 'Your PG owner published a new notice.');
    if (event) notice.notificationEvents = [event];
  }
  await notice.save();
  await tryDeliverNotifications(notice.owner);
  res.status(201).json({ success: true, message: 'Notice published', data: view(notice, req) });
});
export const updateNotice = asyncHandler(async (req, res) => {
  requireOwner(req);
  const notice = await ownedNotice(req);
  for (const field of ['title', 'body', 'pinned', 'expiresAt']) if (req.body[field] !== undefined) notice[field] = req.body[field];
  await notice.save();
  res.json({ success: true, message: 'Notice updated', data: view(notice, req) });
});
export const deleteNotice = asyncHandler(async (req, res) => {
  requireOwner(req);
  const notice = await Notice.findOneAndDelete({ _id: req.params.id, owner: req.communityMember.pgId });
  if (!notice) throw new ApiError(404, 'Notice not found');
  res.json({ success: true, message: 'Notice deleted' });
});
export const markNoticesRead = asyncHandler(async (req, res) => {
  if (req.communityMember.role !== 'resident') throw new ApiError(403, 'This endpoint requires a resident account');
  const through = new Date(req.body.through);
  if (through > new Date()) throw new ApiError(400, 'Read date cannot be in the future');
  await Resident.updateOne({ _id: req.resident._id, owner: req.communityMember.pgId }, { $max: { noticeSeenAt: through } });
  res.json({ success: true, message: 'Notices marked as read' });
});
