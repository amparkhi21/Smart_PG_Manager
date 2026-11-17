import jwt from 'jsonwebtoken';

export default (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
