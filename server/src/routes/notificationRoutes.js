import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { protect, protectResident, verifySession } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../controllers/notificationController.js';
import { registerPushDevice, unregisterPushDevice } from '../controllers/pushDeviceController.js';

const router = Router(), residentAuth = protectResident();
router.use((req, res, next) => {
  try { return verifySession(req).role === 'resident' ? residentAuth(req, res, next) : protect(req, res, next); }
  catch (error) { next(error); }
});
// Identity and PG always come from JWT-backed account lookup, never body/query parameters.
router.get('/', [
  query('page').optional().isString().bail().matches(/^[1-9]\d{0,5}$/),
  query('limit').optional().isString().bail().matches(/^(?:[1-9]\d?|100)$/),
  query('unread').optional().isString().bail().isIn(['true', 'false']),
], validate, listNotifications);
router.get('/unread-count', getUnreadCount);
const deviceWrites = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.owner ? 'owner' : 'resident'}:${req.owner?._id || req.resident._id}`,
  message: { success: false, message: 'Too many device updates. Please wait a minute and try again.' } });
router.post('/devices', deviceWrites, [
  body('deviceId').isString().bail().matches(/^[A-Za-z0-9_-]{16,128}$/).withMessage('Use a stable installation ID of 16–128 characters'),
  body('token').isString().bail().isLength({ min: 20, max: 4096 }).bail().matches(/^[A-Za-z0-9:_.-]+$/).withMessage('Enter a valid FCM registration token'),
  body('platform').optional().isString().bail().isIn(['android']),
], validate, registerPushDevice);
router.delete('/devices/:id', deviceWrites, param('id').isString().bail().isMongoId(), validate, unregisterPushDevice);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', param('id').isString().bail().isMongoId(), validate, markNotificationRead);
export default router;
