const settingsOwner = (owner) => ({
  id: owner._id,
  role: 'owner',
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

export const getSettings = async (context) => {
  return { data: { owner: settingsOwner(context.owner) } };
};

export const updateSettings = async (context) => {
  const { name, email, phone, pgName, address, rentDueDay, defaultElectricityRate, reminderSettings } = context.input;
  const owner = context.owner;

  if (name !== undefined) owner.name = name;
  if (email !== undefined) owner.email = email;
  if (phone !== undefined) owner.phone = phone;
  if (pgName !== undefined) owner.pgName = pgName;
  if (address !== undefined) owner.address = address;
  if (context.input.upiId !== undefined) owner.upiId = context.input.upiId;
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
  return { message: 'Settings saved', data: { owner: settingsOwner(owner) } };
};
