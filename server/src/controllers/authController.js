import Owner from '../models/Owner.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import generateToken from '../utils/generateToken.js';

const publicOwner = (o) => ({
  id: o._id,
  name: o.name,
  email: o.email,
  phone: o.phone,
  pgName: o.pgName,
  address: o.address,
  timezone: o.timezone,
  currency: o.currency,
  defaultElectricityRate: o.defaultElectricityRate,
  rentDueDay: o.rentDueDay,
  reminderSettings: o.reminderSettings,
  isDemo: o.isDemo,
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, pgName, phone } = req.body;
  if (await Owner.findOne({ email: email.toLowerCase() })) {
    throw new ApiError(409, 'An account with this email already exists');
  }
  const owner = await Owner.create({ name, email, password, pgName, phone });
  res.status(201).json({ success: true, data: { token: generateToken(owner._id), owner: publicOwner(owner) } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const owner = await Owner.findOne({ email: email.toLowerCase() }).select('+password');
  // Same message for wrong email or password, so accounts can't be guessed
  if (!owner || !(await owner.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  res.json({ success: true, data: { token: generateToken(owner._id), owner: publicOwner(owner) } });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { owner: publicOwner(req.owner) } });
});