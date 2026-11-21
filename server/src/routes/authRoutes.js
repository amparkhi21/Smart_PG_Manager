import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, getMe } from '../controllers/authController.js';
import { protect, protectResident, protectSession } from '../middleware/auth.js';
import { residentLogin, residentMe, changeResidentPassword } from '../controllers/residentAuthController.js';
import { validPassword } from '../utils/residentAuth.js';
import validate from '../middleware/validate.js';

const router = Router();

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

router.post('/resident/login', [
  body('pgName').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('pgCode').optional({ checkFalsy: true }).isString().bail().trim().isLength({ max: 40 }),
  body('roomNumber').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('phone').isString().bail().notEmpty().isLength({ max: 40 }),
  body('password').isString().bail().notEmpty().isLength({ max: 200 }),
], residentLogin);
router.get('/resident/me', protectResident({ allowPasswordChange: true }), residentMe);
router.post('/resident/change-password', protectResident({ allowPasswordChange: true }), [
  body('currentPassword').isString().bail().notEmpty().isLength({ max: 200 }),
  body('newPassword').custom(validPassword).withMessage('Use at least 8 characters and at most 72 UTF-8 bytes'),
], validate, changeResidentPassword);

export default router;
