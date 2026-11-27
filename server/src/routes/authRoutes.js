import { Router } from 'express';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { register, login, getMe } from '../controllers/authController.js';
import { protect, protectResident, protectSession } from '../middlewares/auth.js';
import { residentHostels, residentLogin, residentMe, changeResidentPassword } from '../controllers/residentAuthController.js';
import { validPassword } from '../utils/residentAuth.js';
import validate from '../middlewares/validate.js';

const router = Router();

const residentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts. Please wait before trying again.' },
});

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Enter a valid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('pgName').trim().notEmpty().withMessage('PG name is required'),
    body('phone').optional({ checkFalsy: true }).trim(),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.get('/me', protect, getMe);
router.get('/session', protectSession, (req, res, next) => req.resident ? residentMe(req, res, next) : getMe(req, res, next));

const residentDiscoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many hostel searches. Please wait before trying again.' },
});
router.get('/resident/hostels', residentDiscoveryLimiter,
  query('name').isString().bail().trim().isLength({ min: 2, max: 100 }), validate, residentHostels);

router.post('/resident/login', residentLoginLimiter, [
  body('ownerId').isMongoId(),
  body('pgName').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('roomNumber').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('bedNumber').isString().bail().trim().notEmpty().isLength({ max: 20 }),
  body('password').isString().bail().notEmpty().isLength({ max: 200 }),
], residentLogin);
router.get('/resident/me', protectResident({ allowPasswordChange: true }), residentMe);
router.post('/resident/change-password', protectResident({ allowPasswordChange: true }), [
  body('currentPassword').isString().bail().notEmpty().isLength({ max: 200 }),
  body('newPassword').custom(validPassword).withMessage('Use at least 8 characters and at most 72 UTF-8 bytes'),
], validate, changeResidentPassword);

export default router;
