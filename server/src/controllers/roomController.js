import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/roomService.js';

export const listRooms = asyncHandler(async (req, res) => {
  const result = await service.listRooms({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const getRoom = asyncHandler(async (req, res) => {
  const result = await service.getRoom({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const createRoom = asyncHandler(async (req, res) => {
  const result = await service.createRoom({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const result = await service.updateRoom({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const result = await service.deleteRoom({
    owner: req.owner,
    resident: req.resident,
    filters: req.query,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
