import jwt from 'jsonwebtoken';
import Owner from '../models/Owner.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Protects a route. Sets req.owner. Every controller must filter by
// { owner: req.owner._id } so one owner can never touch another's data.
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Please log in to continue');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || typeof decoded !== 'object' || !/^[a-f\d]{24}$/i.test(decoded.id || '')) {
      throw new Error('Invalid token subject');
    }
  } catch {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }

  const owner = await Owner.findById(decoded.id);
  if (!owner) throw new ApiError(401, 'Account no longer exists');
  req.owner = owner;
  next();
});
