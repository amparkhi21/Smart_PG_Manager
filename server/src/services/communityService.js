import CommunityMessage from '../models/CommunityMessage.js';
import { COMMUNITY_ISSUE_CATEGORIES, COMMUNITY_ISSUE_STATUSES } from '../constants.js';
import ApiError from '../utils/ApiError.js';

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

export const listCommunityMessages = async (context) => {
  const member = context.member;
  const limit = context.filters.limit === undefined ? 30 : Number(context.filters.limit);
  const scope = { owner: member.pgId, kind: { $in: ['message', 'announcement'] } };
  if (context.filters.before) {
    const { createdAt, id } = readCursor(context.filters.before);
    scope.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }];
  }
  // Newest first. A timestamp + ID cursor remains stable when messages are posted or deleted.
  const results = await CommunityMessage.find(scope).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = results.length > limit, messages = results.slice(0, limit);
  return { count: messages.length, data: {
    pgId: member.pgId, messages: messages.map((message) => view(message, member)), hasMore,
    nextCursor: hasMore ? cursorFor(messages.at(-1)) : null,
  } };
};

export const createCommunityMessage = async (context) => {
  const member = context.member;
  const kind = context.input.kind || 'message';
  if (kind === 'announcement' && member.role !== 'owner') throw new ApiError(403, 'Only the owner can post announcements');
  const message = await CommunityMessage.create({
    owner: member.pgId, sender: member.id, senderRole: member.role, senderName: member.name,
    text: context.input.text, kind,
  });
  return { message: kind === 'announcement' ? 'Announcement posted' : 'Message posted', data: view(message, member) };
};

export const communityIssueView = (issue, member, comments = []) => ({
  id: String(issue._id), pgId: String(issue.owner), category: issue.category, title: issue.title, description: issue.text,
  status: issue.status, author: { id: String(issue.sender), name: issue.senderName, role: issue.senderRole },
  ...(issue.roomNumber && (member.role === 'owner' || String(issue.sender) === String(member.id)) && { roomNumber: issue.roomNumber }),
  createdAt: issue.createdAt,
  ...(issue.image?.fileId && { image: { id: String(issue.image.fileId), contentType: issue.image.contentType, size: issue.image.size } }),
  ...(comments.length && { comments: comments.map((comment) => ({ id: String(comment._id), text: comment.text,
    author: { id: String(comment.sender), name: comment.senderName, role: comment.senderRole }, createdAt: comment.createdAt })) }),
});

export const listCommunityIssues = async (context) => {
  const member = context.member, page = Number(context.filters.page || 1), limit = Number(context.filters.limit || 20);
  const filter = { owner: member.pgId, kind: 'issue', ...(context.filters.category && { category: context.filters.category }), ...(context.filters.status && { status: context.filters.status }) };
  const [issues, total] = await Promise.all([
    CommunityMessage.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CommunityMessage.countDocuments(filter),
  ]);
  return { count: issues.length, data: { issues: issues.map((issue) => communityIssueView(issue, member)), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } };
};

export const createCommunityIssue = async (context) => {
  const member = context.member;
  if (member.role !== 'resident') throw new ApiError(403, 'Only residents can create community posts');
  if (!COMMUNITY_ISSUE_CATEGORIES.includes(context.input.category)) throw new ApiError(400, 'Choose a valid community category');
  const issue = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role, senderName: member.name,
    roomNumber: context.residentRoom?.roomNumber || null, kind: 'issue', category: context.input.category, title: context.input.title, text: context.input.description });
  return { message: 'Community post created', data: communityIssueView(issue, member) };
};

export const getCommunityIssue = async (context) => {
  const member = context.member;
  const issue = await CommunityMessage.findOne({ _id: context.identifiers.id, owner: member.pgId, kind: 'issue' }).lean();
  if (!issue) throw new ApiError(404, 'Community post not found');
  const comments = await CommunityMessage.find({ owner: member.pgId, parentIssue: issue._id, kind: 'issue-comment' }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  return { data: communityIssueView(issue, member, comments) };
};

export const addCommunityIssueComment = async (context) => {
  const member = context.member;
  const issue = await CommunityMessage.findOne({ _id: context.identifiers.id, owner: member.pgId, kind: 'issue' }).select('_id');
  if (!issue) throw new ApiError(404, 'Community post not found');
  const comment = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role,
    senderName: member.name, kind: 'issue-comment', parentIssue: issue._id, text: context.input.text });
  return { message: 'Comment added', data: { id: String(comment._id), text: comment.text,
    author: { id: String(comment.sender), name: comment.senderName, role: comment.senderRole }, createdAt: comment.createdAt } };
};

export const updateCommunityIssueStatus = async (context) => {
  const member = context.member;
  if (member.role !== 'owner') throw new ApiError(403, 'Only the PG owner can change post status');
  if (!COMMUNITY_ISSUE_STATUSES.includes(context.input.status)) throw new ApiError(400, 'Choose a valid post status');
  const issue = await CommunityMessage.findOneAndUpdate({ _id: context.identifiers.id, owner: member.pgId, kind: 'issue' },
    { $set: { status: context.input.status } }, { new: true, runValidators: true });
  if (!issue) throw new ApiError(404, 'Community post not found');
  return { message: 'Community post status updated', data: communityIssueView(issue, member) };
};

export const deleteCommunityIssue = async (context) => {
  const member = context.member;
  if (member.role !== 'owner') throw new ApiError(403, 'Only the PG owner can moderate community posts');
  const issue = await CommunityMessage.findOneAndDelete({ _id: context.identifiers.id, owner: member.pgId, kind: 'issue' });
  if (!issue) throw new ApiError(404, 'Community post not found');
  await CommunityMessage.deleteMany({ owner: member.pgId, parentIssue: issue._id, kind: 'issue-comment' });
  if (issue.image?.fileId) await imageBucket().delete(issue.image.fileId);
  return { message: 'Community post removed', data: { id: String(issue._id) } };
};

export const deleteCommunityMessage = async (context) => {
  const member = context.member;
  const scope = { _id: context.identifiers.id, owner: member.pgId, kind: { $in: ['message', 'announcement'] } };
  if (member.role === 'resident') Object.assign(scope, { sender: member.id, senderRole: 'resident' });
  const deleted = await CommunityMessage.findOneAndDelete(scope);
  if (!deleted) throw new ApiError(404, 'Message not found');
  if (deleted.image?.fileId) await imageBucket().delete(deleted.image.fileId);
  return { message: 'Message deleted', data: { id: deleted._id } };
};

export { view as communityMessageView };
