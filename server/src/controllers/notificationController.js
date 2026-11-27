import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/notificationService.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const result = await service.listNotifications({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await service.getUnreadCount({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const result = await service.markNotificationRead({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await service.markAllNotificationsRead({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
