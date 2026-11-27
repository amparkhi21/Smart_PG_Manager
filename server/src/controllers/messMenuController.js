import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/messMenuService.js';

export const createMessMenu = asyncHandler(async (req, res) => {
  const result = await service.createMessMenu({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.status(201).json({ success: true, ...result });
});

export const listMessMenus = asyncHandler(async (req, res) => {
  const result = await service.listMessMenus({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getMessMenu = asyncHandler(async (req, res) => {
  const result = await service.getMessMenu({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const updateMessMenu = asyncHandler(async (req, res) => {
  const result = await service.updateMessMenu({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const deleteMessMenu = asyncHandler(async (req, res) => {
  const result = await service.deleteMessMenu({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getTodaysMessMenu = asyncHandler(async (req, res) => {
  const result = await service.getTodaysMessMenu({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});

export const getUpcomingMessMenus = asyncHandler(async (req, res) => {
  const result = await service.getUpcomingMessMenus({
    owner: req.owner,
    resident: req.resident,
    identifiers: req.params,
    input: req.body,
    filters: req.query,
  });
  res.json({ success: true, ...result });
});
