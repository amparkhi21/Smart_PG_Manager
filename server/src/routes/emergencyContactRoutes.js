import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect, protectResident } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import ApiError from '../utils/ApiError.js';
import { CONTACT_CATEGORIES, normalizeContactPhone } from '../models/EmergencyContact.js';
import { listContacts, createContact, updateContact, deleteContact } from '../controllers/emergencyContactController.js';

const inputRules = () => [
  body('name').isString().bail().trim().isLength({ min: 1, max: 100 }).withMessage('Contact name must contain 1–100 characters'),
  body('category').isString().bail().isIn(CONTACT_CATEGORIES).withMessage('Choose a valid contact category'),
  body('phone').isString().bail().custom((value) => Boolean(normalizeContactPhone(value))).withMessage('Enter a valid phone number or short helpline')
    .customSanitizer(normalizeContactPhone),
  body('description').optional().isString().bail().trim().isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  body('priority').optional().custom((value) => typeof value === 'boolean').withMessage('Priority must be true or false'),
];
function contactRoutes(ownerView) {
  const router = Router();
  router.use(ownerView ? protect : protectResident());
  if (!ownerView) router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next()
    : next(new ApiError(403, 'Emergency contacts are read-only for residents')));
  router.get('/', [
    query('search').optional().isString().bail().trim().isLength({ max: 100 }),
    query('category').optional().isString().bail().isIn(CONTACT_CATEGORIES),
  ], validate, listContacts);
  if (ownerView) {
    router.post('/', inputRules(), validate, createContact);
    router.put('/:id', param('id').isMongoId(), inputRules(), validate, updateContact);
    router.delete('/:id', param('id').isMongoId(), validate, deleteContact);
  }
  return router;
}
export const residentEmergencyContactRoutes = contactRoutes(false);
export default contactRoutes(true);
