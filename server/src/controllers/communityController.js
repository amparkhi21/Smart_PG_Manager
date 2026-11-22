import CommunityMessage, { COMMUNITY_ISSUE_CATEGORIES, COMMUNITY_ISSUE_STATUSES } from '../models/CommunityMessage.js';
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
  const scope = { owner: member.pgId, kind: { $in: ['message', 'announcement'] } };
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

export const communityIssueView = (issue, member, comments = []) => ({
  id: String(issue._id), pgId: String(issue.owner), category: issue.category, title: issue.title, description: issue.text,
  status: issue.status, author: { id: String(issue.sender), name: issue.senderName, role: issue.senderRole },
  ...(issue.roomNumber && (member.role === 'owner' || String(issue.sender) === String(member.id)) && { roomNumber: issue.roomNumber }),
  createdAt: issue.createdAt,
  ...(issue.image?.fileId && { image: { id: String(issue.image.fileId), contentType: issue.image.contentType, size: issue.image.size } }),
  ...(comments.length && { comments: comments.map((comment) => ({ id: String(comment._id), text: comment.text,
    author: { id: String(comment.sender), name: comment.senderName, role: comment.senderRole }, createdAt: comment.createdAt })) }),
});

export const listCommunityIssues = asyncHandler(async (req, res) => {
  const member = req.communityMember, page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  const filter = { owner: member.pgId, kind: 'issue', ...(req.query.category && { category: req.query.category }), ...(req.query.status && { status: req.query.status }) };
  const [issues, total] = await Promise.all([
    CommunityMessage.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CommunityMessage.countDocuments(filter),
  ]);
  res.json({ success: true, count: issues.length, data: { issues: issues.map((issue) => communityIssueView(issue, member)), pagination: {
    page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total,
  } } });
});

export const createCommunityIssue = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  if (member.role !== 'resident') throw new ApiError(403, 'Only residents can create community posts');
  if (!COMMUNITY_ISSUE_CATEGORIES.includes(req.body.category)) throw new ApiError(400, 'Choose a valid community category');
  const issue = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role, senderName: member.name,
    roomNumber: req.residentRoom?.roomNumber || null, kind: 'issue', category: req.body.category, title: req.body.title, text: req.body.description });
  res.status(201).json({ success: true, message: 'Community post created', data: communityIssueView(issue, member) });
});

export const getCommunityIssue = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const issue = await CommunityMessage.findOne({ _id: req.params.id, owner: member.pgId, kind: 'issue' }).lean();
  if (!issue) throw new ApiError(404, 'Community post not found');
  const comments = await CommunityMessage.find({ owner: member.pgId, parentIssue: issue._id, kind: 'issue-comment' }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  res.json({ success: true, data: communityIssueView(issue, member, comments) });
});

export const addCommunityIssueComment = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const issue = await CommunityMessage.findOne({ _id: req.params.id, owner: member.pgId, kind: 'issue' }).select('_id');
  if (!issue) throw new ApiError(404, 'Community post not found');
  const comment = await CommunityMessage.create({ owner: member.pgId, sender: member.id, senderRole: member.role,
    senderName: member.name, kind: 'issue-comment', parentIssue: issue._id, text: req.body.text });
  res.status(201).json({ success: true, message: 'Comment added', data: { id: String(comment._id), text: comment.text,
    author: { id: String(comment.sender), name: comment.senderName, role: comment.senderRole }, createdAt: comment.createdAt } });
});

export const updateCommunityIssueStatus = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  if (member.role !== 'owner') throw new ApiError(403, 'Only the PG owner can change post status');
  if (!COMMUNITY_ISSUE_STATUSES.includes(req.body.status)) throw new ApiError(400, 'Choose a valid post status');
  const issue = await CommunityMessage.findOneAndUpdate({ _id: req.params.id, owner: member.pgId, kind: 'issue' },
    { $set: { status: req.body.status } }, { new: true, runValidators: true });
  if (!issue) throw new ApiError(404, 'Community post not found');
  res.json({ success: true, message: 'Community post status updated', data: communityIssueView(issue, member) });
});

export const deleteCommunityIssue = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  if (member.role !== 'owner') throw new ApiError(403, 'Only the PG owner can moderate community posts');
  const issue = await CommunityMessage.findOneAndDelete({ _id: req.params.id, owner: member.pgId, kind: 'issue' });
  if (!issue) throw new ApiError(404, 'Community post not found');
  await CommunityMessage.deleteMany({ owner: member.pgId, parentIssue: issue._id, kind: 'issue-comment' });
  if (issue.image?.fileId) await imageBucket().delete(issue.image.fileId);
  res.json({ success: true, message: 'Community post removed', data: { id: String(issue._id) } });
});

export const deleteCommunityMessage = asyncHandler(async (req, res) => {
  const member = req.communityMember;
  const scope = { _id: req.params.id, owner: member.pgId, kind: { $in: ['message', 'announcement'] } };
  if (member.role === 'resident') Object.assign(scope, { sender: member.id, senderRole: 'resident' });
  const deleted = await CommunityMessage.findOneAndDelete(scope);
  if (!deleted) throw new ApiError(404, 'Message not found');
  if (deleted.image?.fileId) await imageBucket().delete(deleted.image.fileId);
  res.json({ success: true, message: 'Message deleted', data: { id: deleted._id } });
});

export { view as communityMessageView };
