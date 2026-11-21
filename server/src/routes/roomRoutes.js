import { Router } from 'express';
import { body, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam } from '../middleware/validators.js';
import { listRooms, getRoom, createRoom, updateRoom, deleteRoom } from '../controllers/roomController.js';

const router = Router();
router.use(protect);

const rules = (isUpdate) => {
  const f = (chain) => (isUpdate ? chain.optional() : chain);
  const rulesList = [
    f(body('roomNumber')).trim().notEmpty().withMessage('Room number is required').isLength({ max: 20 }),
    f(body('monthlyRent')).isFloat({ min: 0 }).withMessage('Monthly rent must be 0 or more').toFloat(),
    f(body('capacity')).isInt({ min: 1, max: 20 }).withMessage('Capacity must be between 1 and 20').toInt(),
    body('floor').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
    body('roomType').optional().isString().bail().trim().isLength({ max: 40 }),
    body('airConditioning').optional({ nullable: true }).isIn(['AC', 'Non-AC']),
    body('amenities').optional().isArray({ max: 30 }),
    body('amenities.*').isString().bail().trim().notEmpty().isLength({ max: 60 }),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 300 }),
  ];
  if (!isUpdate) {
    rulesList.push(body('lastMeterReading').optional().isFloat({ min: 0 }).withMessage('Meter reading must be 0 or more').toFloat());
  }
  return rulesList;
};

router.get('/', [query('status').optional().isIn(['Occupied', 'Vacant'])], validate, listRooms);
router.post('/', rules(false), validate, createRoom);
router.get('/:id', idParam(), validate, getRoom);
router.put('/:id', idParam(), rules(true), validate, updateRoom);
router.delete('/:id', idParam(), validate, deleteRoom);

export default router;
