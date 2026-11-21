import EmergencyContact from '../models/EmergencyContact.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex, findOwned } from '../utils/ownership.js';

const fields = ['name', 'category', 'phone', 'description', 'priority'];
const view = (contact) => ({ id: contact._id, name: contact.name, category: contact.category,
  phone: contact.phone, description: contact.description, priority: contact.priority,
  createdAt: contact.createdAt, updatedAt: contact.updatedAt });
const requireOwner = (req) => { if (!req.owner) throw new ApiError(403, 'Only owners can manage emergency contacts'); };

export const listContacts = asyncHandler(async (req, res) => {
  const scope = { owner: req.owner?._id || req.resident.owner };
  if (req.query.category) scope.category = req.query.category;
  if (req.query.search) {
    const search = { $regex: escapeRegex(req.query.search), $options: 'i' };
    scope.$or = ['name', 'category', 'phone', 'description'].map((field) => ({ [field]: search }));
  }
  const contacts = await EmergencyContact.find(scope).sort({ priority: -1, name: 1, _id: 1 }).lean();
  res.json({ success: true, count: contacts.length, data: { contacts: contacts.map(view) } });
});
export const createContact = asyncHandler(async (req, res) => {
  requireOwner(req);
  const input = Object.fromEntries(fields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]));
  const contact = await EmergencyContact.create({ ...input, owner: req.owner._id });
  res.status(201).json({ success: true, message: 'Emergency contact added', data: view(contact) });
});
export const updateContact = asyncHandler(async (req, res) => {
  requireOwner(req);
  const contact = await findOwned(EmergencyContact, req.params.id, req);
  for (const field of fields) if (req.body[field] !== undefined) contact[field] = req.body[field];
  await contact.save();
  res.json({ success: true, message: 'Emergency contact updated', data: view(contact) });
});
export const deleteContact = asyncHandler(async (req, res) => {
  requireOwner(req);
  const contact = await EmergencyContact.findOneAndDelete({ _id: req.params.id, owner: req.owner._id });
  if (!contact) throw new ApiError(404, 'Emergency contact not found');
  res.json({ success: true, message: 'Emergency contact deleted' });
});
