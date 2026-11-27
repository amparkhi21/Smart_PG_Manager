import { pipeline } from 'node:stream/promises';
import asyncHandler from '../utils/asyncHandler.js';
import * as service from '../services/communityImageService.js';

export const shareCommunityImage = asyncHandler(async (req, res) => {
  const result = await service.shareCommunityImage({
    input: req.body,
    contentType: req.get('Content-Type'),
    member: req.communityMember,
    filters: req.query,
  });
  res.status(201).json({ success: true, ...result });
});

export const getCommunityImage = asyncHandler(async (req, res) => {
  const { file, stream } = await service.getCommunityImage({ id: req.params.id, member: req.communityMember });
  res.set({ 'Content-Type': file.metadata.contentType, 'Content-Length': String(file.length),
    'Content-Disposition': 'inline; filename="community-photo"', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' });
  await pipeline(stream, res);
});
