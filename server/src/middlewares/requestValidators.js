import { REQUEST_CATEGORIES, REQUEST_STATUSES, GENERAL_REQUEST_CATEGORIES, GENERAL_REQUEST_PRIORITIES } from '../constants.js';

export const validateRequestQuery = (query) => [
  query('page').optional().isInt({ min: 1, max: 100 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().isIn(REQUEST_CATEGORIES),
  query('status').optional().isIn(REQUEST_STATUSES),
  query('priority').optional().isIn(GENERAL_REQUEST_PRIORITIES),
  query('resident').optional().isMongoId(),
];

export const validateRequestOwnerBody = (body) => [
  body('response').optional({ values: 'falsy' }).isString().trim().isLength({ min: 1, max: 2000 }),
  body('status').optional().isIn(['Open', 'In Progress', 'Resolved', 'Rejected']),
  body().custom((value) => Boolean(value.response || value.status)).withMessage('Add a reply or choose a status'),
];

export const validateGeneralRequestBody = (body) => [
  body('category').isIn(GENERAL_REQUEST_CATEGORIES),
  body('title').isString().bail().trim().isLength({ min: 3, max: 120 }),
  body('description').isString().bail().trim().isLength({ min: 5, max: 3000 }),
  body('priority').optional().isIn(GENERAL_REQUEST_PRIORITIES),
];
