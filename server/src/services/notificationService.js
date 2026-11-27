import Notification from '../models/Notification.js';
import { deliverPendingNotifications } from './notificationDeliveryService.js';
import ApiError from '../utils/ApiError.js';

const scopeFor = (context) => context.owner ? { owner: context.owner._id, recipientRole: 'owner', recipient: context.owner._id }
  : { owner: context.resident.owner, recipientRole: 'resident', recipient: context.resident._id };
const view = (item) => ({ id: item._id, pgId: item.owner, recipientRole: item.recipientRole, recipientId: item.recipient,
  type: item.type, title: item.title, message: item.message, relatedEntityId: item.relatedEntityId, path: item.path || null,
  read: Boolean(item.readAt), readAt: item.readAt, createdAt: item.createdAt, availableAt: item.availableAt });
async function readyScope(context) {
  const scope = scopeFor(context);
  try { await deliverPendingNotifications(scope.owner, scope); }
  catch { throw new ApiError(503, 'Notifications are temporarily unavailable. Please try again.'); }
  return { ...scope, availableAt: { $lte: new Date() } };
}

export const listNotifications = async (context) => {
  const scope = await readyScope(context), page = Number(context.filters.page || 1), limit = Number(context.filters.limit || 20);
  if (context.filters.unread === 'true') scope.readAt = null;
  const [notifications, total] = await Promise.all([
    Notification.find(scope).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(scope),
  ]);
  return { count: notifications.length, data: { notifications: notifications.map(view), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } };
};
export const getUnreadCount = async (context) => {
  return { data: { unreadCount: await Notification.countDocuments({ ...await readyScope(context), readAt: null }) } };
};
export const markNotificationRead = async (context) => {
  const scope = { ...await readyScope(context), _id: context.identifiers.id };
  const notification = await Notification.findOneAndUpdate({ ...scope, readAt: null }, { $set: { readAt: new Date() } }, { new: true })
    || await Notification.findOne(scope);
  if (!notification) throw new ApiError(404, 'Notification not found');
  return { message: 'Notification marked as read', data: view(notification) };
};
export const markAllNotificationsRead = async (context) => {
  const result = await Notification.updateMany({ ...await readyScope(context), readAt: null }, { $set: { readAt: new Date() } });
  return { message: 'Notifications marked as read', data: { updated: result.modifiedCount } };
};
