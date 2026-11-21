import Notification from '../models/Notification.js';
import { deliverPendingNotifications } from '../utils/notifications.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const scopeFor = (req) => req.owner ? { owner: req.owner._id, recipientRole: 'owner', recipient: req.owner._id }
  : { owner: req.resident.owner, recipientRole: 'resident', recipient: req.resident._id };
const view = (item) => ({ id: item._id, pgId: item.owner, recipientRole: item.recipientRole, recipientId: item.recipient,
  type: item.type, title: item.title, message: item.message, relatedEntityId: item.relatedEntityId, path: item.path || null,
  read: Boolean(item.readAt), readAt: item.readAt, createdAt: item.createdAt, availableAt: item.availableAt });
async function readyScope(req) {
  const scope = scopeFor(req);
  try { await deliverPendingNotifications(scope.owner, scope); }
  catch { throw new ApiError(503, 'Notifications are temporarily unavailable. Please try again.'); }
  return { ...scope, availableAt: { $lte: new Date() } };
}

export const listNotifications = asyncHandler(async (req, res) => {
  const scope = await readyScope(req), page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  if (req.query.unread === 'true') scope.readAt = null;
  const [notifications, total] = await Promise.all([
    Notification.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(scope),
  ]);
  res.json({ success: true, count: notifications.length, data: { notifications: notifications.map(view), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } });
});
export const getUnreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { unreadCount: await Notification.countDocuments({ ...await readyScope(req), readAt: null }) } });
});
export const markNotificationRead = asyncHandler(async (req, res) => {
  const scope = { ...await readyScope(req), _id: req.params.id };
  const notification = await Notification.findOneAndUpdate({ ...scope, readAt: null }, { $set: { readAt: new Date() } }, { new: true })
    || await Notification.findOne(scope);
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, message: 'Notification marked as read', data: view(notification) });
});
export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ ...await readyScope(req), readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true, message: 'Notifications marked as read', data: { updated: result.modifiedCount } });
});
