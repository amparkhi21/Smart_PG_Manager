import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { register, login, getMe } from '../controllers/authController.js';
import { protect, protectResident, protectSession } from '../middleware/auth.js';
import { residentLogin, residentMe, changeResidentPassword, verifyResidentJoin, activateResident } from '../controllers/residentAuthController.js';
import { validPassword } from '../utils/residentAuth.js';
import validate from '../middleware/validate.js';

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

const joinVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many joining attempts. Please wait before trying again.' },
});
const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many activation attempts. Please wait before trying again.' },
});

router.post('/resident/join/verify', joinVerificationLimiter, [
  body('pgName').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('pgJoiningPassword').isString().bail().notEmpty().isLength({ max: 200 }),
  body('roomNumber').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('bedNumber').isString().bail().trim().notEmpty().isLength({ max: 20 }),
  body('pgCode').optional({ checkFalsy: true }).isString().bail().trim().isLength({ max: 40 }),
], validate, verifyResidentJoin);
router.post('/resident/join/activate', activationLimiter, [
  body('challenge').isString().bail().notEmpty().isLength({ max: 2000 }),
  body('activationCode').isString().bail().notEmpty().isLength({ min: 20, max: 100 }),
  body('password').isString().bail().custom(validPassword).withMessage('Use at least 8 characters and at most 72 UTF-8 bytes'),
], validate, activateResident);

router.post('/resident/login', residentLoginLimiter, [
  body('pgName').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('pgCode').optional({ checkFalsy: true }).isString().bail().trim().isLength({ max: 40 }),
  body('roomNumber').optional({ checkFalsy: true }).isString().bail().trim().isLength({ max: 100 }),
  body('phone').isString().bail().notEmpty().isLength({ max: 40 }),
  body('password').isString().bail().notEmpty().isLength({ max: 200 }),
], residentLogin);
router.get('/resident/me', protectResident({ allowPasswordChange: true }), residentMe);
router.post('/resident/change-password', protectResident({ allowPasswordChange: true }), [
  body('currentPassword').isString().bail().notEmpty().isLength({ max: 200 }),
  body('newPassword').custom(validPassword).withMessage('Use at least 8 characters and at most 72 UTF-8 bytes'),
], validate, changeResidentPassword);

export default router;
