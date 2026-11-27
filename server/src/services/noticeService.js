import Notice from '../models/Notice.js';
import Resident from '../models/Resident.js';
import ApiError from '../utils/ApiError.js';

import { notificationEvent } from '../models/notificationOutbox.js';
import { tryDeliverNotifications } from './notificationDeliveryService.js';

const view = (notice, context, now = new Date()) => ({
  id: notice._id, pgId: notice.owner, title: notice.title, body: notice.body, pinned: notice.pinned,
  expiresAt: notice.expiresAt, createdAt: notice.createdAt, updatedAt: notice.updatedAt,
  isExpired: Boolean(notice.expiresAt && notice.expiresAt <= now),
  isNew: context.member.role === 'resident' && (!context.resident.noticeSeenAt || notice.updatedAt > context.resident.noticeSeenAt),
});
const requireOwner = (context) => { if (context.member.role !== 'owner') throw new ApiError(403, 'Only the owner can manage notices'); };
async function ownedNotice(context) {
  const notice = await Notice.findOne({ _id: context.identifiers.id, owner: context.member.pgId });
  if (!notice) throw new ApiError(404, 'Notice not found');
  return notice;
}
export const listNotices = async (context) => {
  const now = new Date(), scope = { owner: context.member.pgId };
  if (context.member.role === 'resident') scope.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
  const notices = await Notice.find(scope).sort({ pinned: -1, createdAt: -1, _id: -1 }).lean();
  return { count: notices.length, data: { pgId: context.member.pgId,
    notices: notices.map((notice) => view(notice, context, now)), readThrough: now.toISOString() } };
};
export const createNotice = async (context) => {
  requireOwner(context);
  const notice = new Notice({ owner: context.member.pgId, title: context.input.title, body: context.input.body,
    pinned: context.input.pinned, expiresAt: context.input.expiresAt });
  if (!notice.expiresAt || notice.expiresAt > new Date()) {
    const residents = await Resident.find({ owner: notice.owner, status: 'Active', loginEnabled: true, accountStatus: 'active' }).select('_id').lean();
    const event = notificationEvent('notice_published', notice._id, residents.map((resident) => resident._id),
      `New PG notice: ${notice.title}`, 'Your PG owner published a new notice.');
    if (event) notice.notificationEvents = [event];
  }
  await notice.save();
  await tryDeliverNotifications(notice.owner);
  return { message: 'Notice published', data: view(notice, context) };
};
export const updateNotice = async (context) => {
  requireOwner(context);
  const notice = await ownedNotice(context);
  for (const field of ['title', 'body', 'pinned', 'expiresAt']) if (context.input[field] !== undefined) notice[field] = context.input[field];
  await notice.save();
  return { message: 'Notice updated', data: view(notice, context) };
};
export const deleteNotice = async (context) => {
  requireOwner(context);
  const notice = await Notice.findOneAndDelete({ _id: context.identifiers.id, owner: context.member.pgId });
  if (!notice) throw new ApiError(404, 'Notice not found');
  return { message: 'Notice deleted' };
};
export const markNoticesRead = async (context) => {
  if (context.member.role !== 'resident') throw new ApiError(403, 'This endpoint requires a resident account');
  const through = new Date(context.input.through);
  if (through > new Date()) throw new ApiError(400, 'Read date cannot be in the future');
  await Resident.updateOne({ _id: context.resident._id, owner: context.member.pgId }, { $max: { noticeSeenAt: through } });
  return { message: 'Notices marked as read' };
};
