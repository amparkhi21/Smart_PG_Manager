import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/noticeService.js';

export const listNotices = asyncHandler(async (req, res) => {
  const result = await service.listNotices({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const createNotice = asyncHandler(async (req, res) => {
  const result = await service.createNotice({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    identifiers: req.params,
    input: req.body,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateNotice = asyncHandler(async (req, res) => {
  const result = await service.updateNotice({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const deleteNotice = asyncHandler(async (req, res) => {
  const result = await service.deleteNotice({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});

export const markNoticesRead = asyncHandler(async (req, res) => {
  const result = await service.markNoticesRead({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    identifiers: req.params,
    input: req.body,
  });
  res.json({ success: true, ...result });
});
