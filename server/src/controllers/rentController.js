import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/rentService.js';

export const generateRent = asyncHandler(async (req, res) => {
  const result = await service.generateRent({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const listRent = asyncHandler(async (req, res) => {
  const result = await service.listRent({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const getRent = asyncHandler(async (req, res) => {
  const result = await service.getRent({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const addRentPayment = asyncHandler(async (req, res) => {
  const { created, ...result } = await service.addRentPayment({
    owner: req.owner,
    resident: req.resident,
    input: req.body,
    filters: req.query,
    identifiers: req.params,
  });
  res.status(created ? 201 : 200).json({ success: true, ...result });
});
