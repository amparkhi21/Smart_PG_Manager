import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

export default (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  throw new ApiError(
    400,
    'Validation failed',
    result.array().map((e) => ({ field: e.path, message: e.msg }))
  );
};