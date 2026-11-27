import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/emergencyContactService.js';

export const listContacts = asyncHandler(async (req, res) => {
  const result = await service.listContacts({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const createContact = asyncHandler(async (req, res) => {
  const result = await service.createContact({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateContact = asyncHandler(async (req, res) => {
  const result = await service.updateContact({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const deleteContact = asyncHandler(async (req, res) => {
  const result = await service.deleteContact({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    input: req.body,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
