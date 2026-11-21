import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { protect, protectResident, verifySession } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { MESSAGE_MAX_LENGTH } from '../models/CommunityMessage.js';
import { listCommunityMessages, createCommunityMessage, deleteCommunityMessage } from '../controllers/communityController.js';
import { IMAGE_MAX_BYTES } from '../utils/communityImages.js';
import { shareCommunityImage, getCommunityImage } from '../controllers/communityImageController.js';
import { listNotices, createNotice, updateNotice, deleteNotice, markNoticesRead } from '../controllers/noticeController.js';

const router = Router();
const residentAuth = protectResident();
router.use((req, res, next) => {
  try { return verifySession(req).role === 'resident' ? residentAuth(req, res, next) : protect(req, res, next); }
  catch (error) { next(error); }
});
router.use((req, res, next) => {
  req.communityMember = req.resident
    ? { pgId: req.resident.owner, id: req.resident._id, role: 'resident', name: req.resident.fullName }
    : { pgId: req.owner._id, id: req.owner._id, role: 'owner', name: req.owner.name };
  next();
});

const postLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.communityMember.pgId}:${req.communityMember.role}:${req.communityMember.id}`,
  message: { success: false, message: 'Too many community messages. Please wait a minute before posting again.' },
});

router.get('/messages', [
  query('limit').optional().isString().bail().matches(/^(?:[1-9]\d?|100)$/).withMessage('Use a message limit from 1 to 100'),
  query('before').optional().isString().bail().isLength({ min: 1, max: 160 }).bail().matches(/^[A-Za-z0-9_-]+$/),
], validate, listCommunityMessages);
router.post('/messages', postLimiter, [
  body('text').isString().bail().trim().isLength({ min: 1, max: MESSAGE_MAX_LENGTH }).withMessage(`Enter a message of 1 to ${MESSAGE_MAX_LENGTH} characters`),
  body('kind').optional().isString().bail().isIn(['message', 'announcement']),
], validate, createCommunityMessage);
router.delete('/messages/:id', param('id').isString().bail().isMongoId(), validate, deleteCommunityMessage);
router.post('/images', postLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: IMAGE_MAX_BYTES, inflate: false }), shareCommunityImage);
router.get('/images/:id', param('id').isString().bail().isMongoId(), validate, getCommunityImage);

const noticeRules = (partial = false) => [
  (partial ? body('title').optional() : body('title')).isString().bail().trim().isLength({ min: 1, max: 120 }),
  (partial ? body('body').optional() : body('body')).isString().bail().trim().isLength({ min: 1, max: 5000 }),
  body('pinned').optional().custom((value) => typeof value === 'boolean'),
  body('expiresAt').optional({ nullable: true }).isString().bail().isISO8601({ strict: true }).bail().custom((value) => Number.isFinite(Date.parse(value))),
];
router.get('/notices', listNotices);
router.post('/notices', postLimiter, noticeRules(), validate, createNotice);
router.post('/notices/read', body('through').isString().bail().isISO8601({ strict: true }), validate, markNoticesRead);
router.put('/notices/:id', [param('id').isMongoId(), ...noticeRules()], validate, updateNotice);
router.patch('/notices/:id/pin', [param('id').isMongoId(), body('pinned').custom((value) => typeof value === 'boolean')], validate, updateNotice);
router.delete('/notices/:id', param('id').isMongoId(), validate, deleteNotice);
export default router;
