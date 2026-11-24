import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam, monthIn } from '../middleware/validators.js';
import { normalizePhone, validPassword } from '../utils/residentAuth.js';
import {
  listResidents, getResident, getResidentProfile, createResident,
  updateResident, markResidentLeft, deleteResident,
} from '../controllers/residentController.js';

const router = Router();
router.use(protect);

const rules = (isUpdate) => {
  const f = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    f(body('room')).isMongoId().withMessage('A valid room is required'),
    f(body('bedNumber')).isString().bail().trim().notEmpty().isLength({ max: 20 }).withMessage('A bed number is required'),
    f(body('fullName')).trim().notEmpty().withMessage('Full name is required').isLength({ max: 80 }),
    f(body('phone'))
      .customSanitizer((v) => typeof v === 'string' ? v.replace(/[\s().-]/g, '') : v)
      .custom((v) => Boolean(normalizePhone(v))).withMessage('Enter a valid phone number'),
    body('loginEnabled').optional().isBoolean({ strict: true }).withMessage('Login access must be true or false'),
    body('temporaryPassword').optional().custom(validPassword).withMessage('Use at least 8 characters and at most 72 UTF-8 bytes'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email'),
    body('joiningDate').optional().isISO8601().withMessage('Invalid joining date'),
    body('monthlyRent').optional().isFloat({ min: 0 }).withMessage('Monthly rent must be 0 or more').toFloat(),
    body('emergencyContact').optional().isObject({ strict: true }).withMessage('Invalid parent contact'),
    body('emergencyContact.name').optional({ checkFalsy: true }).isString().bail().trim().isLength({ max: 80 }),
    body('emergencyContact.phone').optional()
      .customSanitizer((v) => typeof v === 'string' ? v.replace(/[\s().-]/g, '') : v)
      .custom((v) => v === '' || Boolean(normalizePhone(v))).withMessage('Enter a valid parent phone number'),
  ];
};

router.get(
  '/',
  [
    query('status').optional().isIn(['Active', 'Left']),
    query('room').optional().isMongoId(),
  ],
  validate,
  listResidents
);
router.post('/', rules(false), validate, createResident);
router.get('/:id/profile', idParam(), monthIn(query, 'month', { optional: true, allowFuture: true }), validate, getResidentProfile);
router.get('/:id', idParam(), validate, getResident);
router.put('/:id', idParam(), rules(true), validate, updateResident);
router.patch('/:id/login-access', idParam(),
  body('loginEnabled').isBoolean({ strict: true }),
  body('temporaryPassword').optional().custom(validPassword), validate, updateResident);
router.post('/:id/reset-password', idParam(), body('temporaryPassword').custom(validPassword), validate, updateResident);
router.patch('/:id/leave', idParam(), body('leftDate').optional().isISO8601(), validate, markResidentLeft);
router.delete('/:id', idParam(), validate, deleteResident);

export default router;
