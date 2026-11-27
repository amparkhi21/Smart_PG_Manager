import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import CommunityMessage from '../models/CommunityMessage.js';
import { communityMessageView, communityIssueView } from './communityService.js';
import { imageBucket, imageType } from '../utils/communityImages.js';
import ApiError from '../utils/ApiError.js';

export async function shareCommunityImage({ input, contentType, member, filters }) {
  const format = imageType(input);
  if (contentType?.split(';')[0].trim().toLowerCase() !== format.type) throw new ApiError(400, 'Photo content does not match its file type');
  const bucket = imageBucket(), id = new mongoose.Types.ObjectId();
  const issue = filters.issueId && await CommunityMessage.findOne({ _id: filters.issueId, owner: member.pgId, kind: 'issue',
    ...(member.role === 'resident' && { sender: member.id, senderRole: 'resident' }) });
  if (filters.issueId && !issue) throw new ApiError(404, 'Community post not found');
  if (issue?.image?.fileId) throw new ApiError(409, 'This post already has a photo');
  try {
    await pipeline(Readable.from([input]), bucket.openUploadStreamWithId(id, `community-${id}.${format.extension}`, {
      metadata: { owner: member.pgId, sender: member.id, senderRole: member.role, contentType: format.type },
    }));
    const image = { fileId: id, contentType: format.type, size: input.length };
    if (issue) {
      const updated = await CommunityMessage.findOneAndUpdate({ _id: issue._id, owner: member.pgId, kind: 'issue', image: { $exists: false } }, { $set: { image } }, { new: true });
      if (!updated) throw new ApiError(409, 'This post already has a photo');
      return { message: 'Photo attached', data: communityIssueView(updated, member) };
    }
    const message = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role, senderName: member.name, text: '', image });
    return { message: 'Photo shared', data: communityMessageView(message, member) };
  } catch (error) { await bucket.delete(id).catch(() => {}); throw error; }
}

export async function getCommunityImage({ id: value, member }) {
  const id = new mongoose.Types.ObjectId(value), owner = member.pgId, bucket = imageBucket();
  const [file, message] = await Promise.all([
    bucket.find({ _id: id, 'metadata.owner': owner }).next(), CommunityMessage.exists({ owner, 'image.fileId': id }),
  ]);
  if (!file || !message) throw new ApiError(404, 'Photo not found');
  return { file, stream: bucket.openDownloadStream(id) };
}
