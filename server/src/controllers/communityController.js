import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/communityService.js';

export const listCommunityMessages = asyncHandler(async (req, res) => {
  const result = await service.listCommunityMessages({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const createCommunityMessage = asyncHandler(async (req, res) => {
  const result = await service.createCommunityMessage({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const listCommunityIssues = asyncHandler(async (req, res) => {
  const result = await service.listCommunityIssues({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const createCommunityIssue = asyncHandler(async (req, res) => {
  const result = await service.createCommunityIssue({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const getCommunityIssue = asyncHandler(async (req, res) => {
  const result = await service.getCommunityIssue({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const addCommunityIssueComment = asyncHandler(async (req, res) => {
  const result = await service.addCommunityIssueComment({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.status(201).json({ success: true, ...result });
});

export const updateCommunityIssueStatus = asyncHandler(async (req, res) => {
  const result = await service.updateCommunityIssueStatus({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const deleteCommunityIssue = asyncHandler(async (req, res) => {
  const result = await service.deleteCommunityIssue({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});

export const deleteCommunityMessage = asyncHandler(async (req, res) => {
  const result = await service.deleteCommunityMessage({
    owner: req.owner,
    resident: req.resident,
    member: req.communityMember,
    filters: req.query,
    input: req.body,
    residentRoom: req.residentRoom,
    identifiers: req.params,
  });
  res.json({ success: true, ...result });
});
