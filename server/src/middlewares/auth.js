import jwt from 'jsonwebtoken';
import Owner from '../models/Owner.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import Resident from '../models/Resident.js';
import Room from '../models/Room.js';

// Protects a route. Sets req.owner. Every application service must filter by
// { owner: req.owner._id } so one owner can never touch another's data.
export function verifySession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Please log in to continue');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || typeof decoded !== 'object' || typeof decoded.id !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.id)) {
      throw new Error('Invalid token subject');
    }
  } catch {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }

  return decoded;
}

export const protect = asyncHandler(async (req, res, next) => {
  const decoded = verifySession(req);
  // Role-less v1 owner tokens remain valid. No other role can reach owner APIs.
  if ((decoded.role !== undefined && decoded.role !== 'owner') || decoded.pgId || decoded.version !== undefined) {
    throw new ApiError(403, 'This endpoint requires an owner account');
  }
  const owner = await Owner.findById(decoded.id);
  if (!owner) throw new ApiError(401, 'Account no longer exists');
  req.owner = owner;
  next();
});

export const protectResident = ({ allowPasswordChange = false } = {}) => asyncHandler(async (req, res, next) => {
  const decoded = verifySession(req);
  if (decoded.role !== 'resident') throw new ApiError(403, 'This endpoint requires a resident account');
  if (!/^[a-f\d]{24}$/i.test(decoded.pgId || '') || !Number.isSafeInteger(decoded.version)) {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }
  const resident = await Resident.findOne({ _id: decoded.id, owner: decoded.pgId });
  if (!resident || !resident.loginEnabled || resident.accountStatus !== 'active' || resident.status !== 'Active'
      || resident.sessionVersion !== decoded.version) {
    throw new ApiError(401, 'Your session has expired. Please log in again');
  }
  const [owner, room] = await Promise.all([
    Owner.findById(resident.owner).select('pgName phone'),
    Room.findOne({ _id: resident.room, owner: resident.owner }).select('roomNumber'),
  ]);
  if (!owner || !room) throw new ApiError(401, 'Your session has expired. Please log in again');
  if (resident.passwordChangeRequired && !allowPasswordChange) {
    throw new ApiError(403, 'Change your temporary password to continue', [{ field: 'password', message: 'Password change required' }]);
  }
  req.resident = resident;
  req.residentOwner = owner;
  req.residentRoom = room;
  next();
});

export const protectSession = (req, res, next) => {
  try {
    const decoded = verifySession(req);
    return decoded.role === 'resident' ? protectResident({ allowPasswordChange: true })(req, res, next) : protect(req, res, next);
  } catch (error) { next(error); }
};
