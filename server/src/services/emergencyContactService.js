import EmergencyContact from '../models/EmergencyContact.js';

import ApiError from '../utils/ApiError.js';
import { escapeRegex, findOwned } from '../utils/ownership.js';

const fields = ['name', 'category', 'phone', 'description', 'priority'];
const view = (contact) => ({ id: contact._id, name: contact.name, category: contact.category,
  phone: contact.phone, description: contact.description, priority: contact.priority,
  createdAt: contact.createdAt, updatedAt: contact.updatedAt });
const requireOwner = (context) => { if (!context.owner) throw new ApiError(403, 'Only owners can manage emergency contacts'); };

export const listContacts = async (context) => {
  const scope = { owner: context.owner?._id || context.resident.owner };
  if (context.filters.category) scope.category = context.filters.category;
  if (context.filters.search) {
    const search = { $regex: escapeRegex(context.filters.search), $options: 'i' };
    scope.$or = ['name', 'category', 'phone', 'description'].map((field) => ({ [field]: search }));
  }
  const contacts = await EmergencyContact.find(scope).sort({ priority: -1, name: 1, _id: 1 }).lean();
  return { count: contacts.length, data: { contacts: contacts.map(view) } };
};
export const createContact = async (context) => {
  requireOwner(context);
  const input = Object.fromEntries(fields.filter((field) => context.input[field] !== undefined).map((field) => [field, context.input[field]]));
  const contact = await EmergencyContact.create({ ...input, owner: context.owner._id });
  return { message: 'Emergency contact added', data: view(contact) };
};
export const updateContact = async (context) => {
  requireOwner(context);
  const contact = await findOwned(EmergencyContact, context.identifiers.id, context);
  for (const field of fields) if (context.input[field] !== undefined) contact[field] = context.input[field];
  await contact.save();
  return { message: 'Emergency contact updated', data: view(contact) };
};
export const deleteContact = async (context) => {
  requireOwner(context);
  const contact = await EmergencyContact.findOneAndDelete({ _id: context.identifiers.id, owner: context.owner._id });
  if (!contact) throw new ApiError(404, 'Emergency contact not found');
  return { message: 'Emergency contact deleted' };
};
