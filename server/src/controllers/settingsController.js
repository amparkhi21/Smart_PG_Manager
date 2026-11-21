import asyncHandler from '../utils/asyncHandler.js';
import { pgCode } from '../utils/residentAuth.js';

const settingsOwner = (owner) => ({
  id: owner._id,
  role: 'owner',
  pgCode: pgCode(owner._id),
  name: owner.name,
  email: owner.email,
  phone: owner.phone,
  pgName: owner.pgName,
  address: owner.address || '',
  upiId: owner.upiId || '',
  timezone: owner.timezone,
  currency: owner.currency,
  defaultElectricityRate: owner.defaultElectricityRate,
  rentDueDay: owner.rentDueDay,
  reminderSettings: owner.reminderSettings,
});

export const getSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { owner: settingsOwner(req.owner) } });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const { name, email, phone, pgName, address, rentDueDay, defaultElectricityRate, reminderSettings } = req.body;
  const owner = req.owner;

  if (name !== undefined) owner.name = name;
  if (email !== undefined) owner.email = email;
  if (phone !== undefined) owner.phone = phone;
  if (pgName !== undefined) owner.pgName = pgName;
  if (address !== undefined) owner.address = address;
  if (req.body.upiId !== undefined) owner.upiId = req.body.upiId;
  if (rentDueDay !== undefined) owner.rentDueDay = rentDueDay;
  if (defaultElectricityRate !== undefined) owner.defaultElectricityRate = defaultElectricityRate;
  if (reminderSettings) {
    const currentSettings = owner.toObject().reminderSettings || {};
    const currentTemplates = currentSettings.templates || {};
    owner.reminderSettings = {
      ...currentSettings,
      ...reminderSettings,
      templates: {
        ...currentTemplates,
        ...(reminderSettings.templates || {}),
      },
    };
  }

  await owner.save();
  res.json({ success: true, message: 'Settings saved', data: { owner: settingsOwner(owner) } });
});
