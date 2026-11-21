import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { protect, protectResident } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES } from '../models/Complaint.js';
import { createComplaint, listComplaints, getComplaint, getComplaintHistory, addComplaintComment, updateComplaintStatus, reopenComplaint } from '../controllers/complaintController.js';

function complaintRoutes(ownerView) {
  const router = Router();
  router.use(ownerView ? protect : protectResident());
  const writes = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${ownerView ? 'owner' : 'resident'}:${req.owner?._id || req.resident._id}`,
    message: { success: false, message: 'Too many complaint updates. Please wait a minute and try again.' } });
  const id = () => param('id').isString().bail().isMongoId();
  const pageRules = () => [query('page').optional().isString().bail().matches(/^[1-9]\d{0,5}$/),
    query('limit').optional().isString().bail().matches(/^(?:[1-9]\d?|100)$/)];
  router.get('/', [...pageRules(),
    query('status').optional().isString().bail().isIn(COMPLAINT_STATUSES),
    query('category').optional().isString().bail().isIn(COMPLAINT_CATEGORIES),
    query('priority').optional().isString().bail().isIn(COMPLAINT_PRIORITIES),
    query('resident').optional().isString().bail().isMongoId(),
  ], validate, listComplaints);
  if (!ownerView) router.post('/', writes, [
    body('title').isString().bail().trim().isLength({ min: 1, max: 120 }),
    body('description').isString().bail().trim().isLength({ min: 1, max: 5000 }),
    body('category').isString().bail().isIn(COMPLAINT_CATEGORIES),
    body('priority').optional().isString().bail().isIn(COMPLAINT_PRIORITIES),
    body('room').optional({ nullable: true }).isString().bail().isMongoId(),
  ], validate, createComplaint);
  router.get('/:id', id(), validate, getComplaint);
  router.get('/:id/history', [id(), ...pageRules()], validate, getComplaintHistory);
  router.post('/:id/comments', writes, [id(), body('text').isString().bail().trim().isLength({ min: 1, max: 2000 })], validate, addComplaintComment);
  if (ownerView) router.patch('/:id/status', writes, [id(),
    body('status').isString().bail().isIn(COMPLAINT_STATUSES),
    body('resolutionNote').optional().isString().bail().trim().isLength({ max: 2000 }),
  ], validate, updateComplaintStatus);
  else router.post('/:id/reopen', writes, [id(), body('text').optional().isString().bail().trim().isLength({ max: 2000 })], validate, reopenComplaint);
  return router;
}
export const residentComplaintRoutes = complaintRoutes(false);
export default complaintRoutes(true);
