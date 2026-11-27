import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/residentService.js';

export const listResidents = asyncHandler(async (req, res) => {
  const result = await service.listResidents({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getResident = asyncHandler(async (req, res) => {
  const result = await service.getResident({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getResidentProfile = asyncHandler(async (req, res) => {
  const result = await service.getResidentProfile({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const createResident = asyncHandler(async (req, res) => {
  const result = await service.createResident({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateResident = asyncHandler(async (req, res) => {
  const result = await service.updateResident({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const markResidentLeft = asyncHandler(async (req, res) => {
  const result = await service.markResidentLeft({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const deleteResident = asyncHandler(async (req, res) => {
  const result = await service.deleteResident({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
