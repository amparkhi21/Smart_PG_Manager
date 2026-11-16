import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam, monthIn } from '../middleware/validators.js';
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
    f(body('fullName')).trim().notEmpty().withMessage('Full name is required').isLength({ max: 80 }),
    f(body('phone'))
      .customSanitizer((v) => String(v ?? '').replace(/[\s-]/g, ''))
      .matches(/^\+?[0-9]{10,13}$/).withMessage('Enter a valid phone number'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email'),
    body('joiningDate').optional().isISO8601().withMessage('Invalid joining date'),
    body('monthlyRent').optional().isFloat({ min: 0 }).withMessage('Monthly rent must be 0 or more').toFloat(),
    body('emergencyContact.name').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
    body('emergencyContact.phone').optional({ checkFalsy: true }).trim().matches(/^\+?[0-9]{10,13}$/).withMessage('Invalid emergency contact phone'),
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
router.patch('/:id/leave', idParam(), body('leftDate').optional().isISO8601(), validate, markResidentLeft);
router.delete('/:id', idParam(), validate, deleteResident);

export default router;