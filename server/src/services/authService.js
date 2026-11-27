import Owner from '../models/Owner.js';
import ApiError from '../utils/ApiError.js';

import generateToken from '../utils/generateToken.js';
import bcrypt from 'bcryptjs';

const dummyHash = bcrypt.hashSync('invalid-owner-credentials', 12);

const publicOwner = (o) => ({
  id: o._id,
  role: 'owner',
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

export const register = async (context) => {
  const { name, email, password, pgName, phone } = context.input;
  if (await Owner.findOne({ email: email.toLowerCase() })) {
    throw new ApiError(409, 'Unable to create an account with these details');
  }
  const owner = await Owner.create({ name, email, password, pgName, phone });
  return { data: { token: generateToken(owner._id), owner: publicOwner(owner) } };
};

export const login = async (context) => {
  const { email, password } = context.input;
  const owner = await Owner.findOne({ email: email.toLowerCase() }).select('+password');
  // Same message for wrong email or password, so accounts can't be guessed
  const valid = owner ? await owner.comparePassword(password) : await bcrypt.compare(password, dummyHash);
  if (!owner || !valid) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return { data: { token: generateToken(owner._id), owner: publicOwner(owner) } };
};

export const getMe = async (context) => {
  return { data: { owner: publicOwner(context.owner) } };
};
