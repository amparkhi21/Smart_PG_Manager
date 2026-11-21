import jwt from 'jsonwebtoken';

export default (id) =>
  jwt.sign({ id, role: 'owner' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

export const generateResidentToken = (resident) => jwt.sign({
  id: resident._id, role: 'resident', pgId: resident.owner, version: resident.sessionVersion,
}, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
