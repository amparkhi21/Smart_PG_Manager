import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import CommunityMessage from '../models/CommunityMessage.js';
import { communityMessageView } from './communityController.js';
import { imageBucket, imageType } from '../utils/communityImages.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const shareCommunityImage = asyncHandler(async (req, res) => {
  const format = imageType(req.body);
  if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== format.type) throw new ApiError(400, 'Photo content does not match its file type');
  const member = req.communityMember, bucket = imageBucket(), id = new mongoose.Types.ObjectId();
  try {
    await pipeline(Readable.from([req.body]), bucket.openUploadStreamWithId(id, `community-${id}.${format.extension}`, {
      metadata: { owner: member.pgId, sender: member.id, senderRole: member.role, contentType: format.type },
    }));
    const message = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role,
      senderName: member.name, text: '', image: { fileId: id, contentType: format.type, size: req.body.length } });
    res.status(201).json({ success: true, message: 'Photo shared', data: communityMessageView(message, member) });
  } catch (error) { await bucket.delete(id).catch(() => {}); throw error; }
});

export const getCommunityImage = asyncHandler(async (req, res) => {
  const id = new mongoose.Types.ObjectId(req.params.id), owner = req.communityMember.pgId, bucket = imageBucket();
  const [file, message] = await Promise.all([
    bucket.find({ _id: id, 'metadata.owner': owner }).next(),
    CommunityMessage.exists({ owner, 'image.fileId': id }),
  ]);
  if (!file || !message) throw new ApiError(404, 'Photo not found');
  res.set({ 'Content-Type': file.metadata.contentType, 'Content-Length': String(file.length),
    'Content-Disposition': 'inline; filename="community-photo"', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' });
  await pipeline(bucket.openDownloadStream(id), res);
});
