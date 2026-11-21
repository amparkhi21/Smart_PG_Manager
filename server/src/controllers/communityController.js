import CommunityMessage from '../models/CommunityMessage.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { imageBucket } from '../utils/communityImages.js';

const cursorFor = (message) => Buffer.from(`${message.createdAt.toISOString()}|${message._id}`).toString('base64url');

function readCursor(cursor) {
  const [date, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(date);
  if (extra !== undefined || !/^[a-f\d]{24}$/i.test(id || '') || !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== date) {
    throw new ApiError(400, 'Invalid message history cursor');
  }
  return { createdAt, id };
}

const view = (message, member) => ({
  id: message._id, pgId: message.owner, text: message.text, kind: message.kind,
  sender: { id: message.sender, name: message.senderName, role: message.senderRole },
  createdAt: message.createdAt,
  ...(message.image?.fileId && { image: { id: message.image.fileId, contentType: message.image.contentType, size: message.image.size } }),
  canDelete: member.role === 'owner' || (message.senderRole === 'resident' && String(message.sender) === String(member.id)),
});

export const listCommunityMessages = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
  const scope = { owner: member.pgId };
  if (req.query.before) {
    const { createdAt, id } = readCursor(req.query.before);
    scope.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }];
  }
  // Newest first. A timestamp + ID cursor remains stable when messages are posted or deleted.
  const results = await CommunityMessage.find(scope).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = results.length > limit, messages = results.slice(0, limit);
  res.json({ success: true, count: messages.length, data: {
    pgId: member.pgId, messages: messages.map((message) => view(message, member)), hasMore,
    nextCursor: hasMore ? cursorFor(messages.at(-1)) : null,
  } });
});

export const createCommunityMessage = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const kind = req.body.kind || 'message';
  if (kind === 'announcement' && member.role !== 'owner') throw new ApiError(403, 'Only the owner can post announcements');
  const message = await CommunityMessage.create({
    owner: member.pgId, sender: member.id, senderRole: member.role, senderName: member.name,
    text: req.body.text, kind,
  });
  res.status(201).json({ success: true, message: kind === 'announcement' ? 'Announcement posted' : 'Message posted', data: view(message, member) });
});

export const deleteCommunityMessage = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const scope = { _id: req.params.id, owner: member.pgId };
  if (member.role === 'resident') Object.assign(scope, { sender: member.id, senderRole: 'resident' });
  const deleted = await CommunityMessage.findOneAndDelete(scope);
  if (!deleted) throw new ApiError(404, 'Message not found');
  if (deleted.image?.fileId) await imageBucket().delete(deleted.image.fileId);
  res.json({ success: true, message: 'Message deleted', data: { id: deleted._id } });
});

export { view as communityMessageView };
