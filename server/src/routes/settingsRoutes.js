import { Router } from 'express';
import { body } from 'express-validator';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { validUpiId } from '../utils/upi.js';

const router = Router();
router.use(protect);

const templateFields = ['pendingRent', 'overdueRent', 'pendingElectricity', 'overdueElectricity'];

router.get('/', getSettings);
router.patch(
  '/',
  [
    body('name').optional().trim().notEmpty().withMessage('Owner name is required').isLength({ max: 80 }),
    body('email').optional().trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('phone')
      .optional({ checkFalsy: true })
      .customSanitizer((v) => String(v ?? '').replace(/[\s()-]/g, ''))
      .matches(/^\+?[0-9]{10,13}$/).withMessage('Enter a valid phone number'),
    body('pgName').optional().trim().notEmpty().withMessage('PG name is required').isLength({ max: 100 }),
    body('address').optional().trim().isLength({ max: 300 }).withMessage('Address must be 300 characters or fewer'),
    body('upiId').optional().isString().bail().trim().custom((value) => value === '' || validUpiId(value)).withMessage('Enter a valid UPI ID, such as name@bank'),
    body('rentDueDay').optional().isInt({ min: 1, max: 28 }).withMessage('Rent due day must be between 1 and 28').toInt(),
    body('defaultElectricityRate').optional().isFloat({ min: 0, max: 100000 }).withMessage('Electricity rate must be 0 or more').toFloat(),
    body('reminderSettings.preferredTiming').optional().isIn(['Anytime', 'Morning', 'Afternoon', 'Evening']),
    body('reminderSettings.duplicateWarningHours').optional().isInt({ min: 1, max: 720 }).toInt(),
    body('reminderSettings.suggestionsEnabled').optional().isBoolean().toBoolean(),
    ...templateFields.map((field) =>
      body(`reminderSettings.templates.${field}`).optional().isString().trim().isLength({ max: 1500 })
    ),
  ],
  validate,
  updateSettings
);

export default router;
