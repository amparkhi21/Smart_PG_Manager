import { MESSAGE_MAX_LENGTH, COMMUNITY_ISSUE_CATEGORIES, COMMUNITY_ISSUE_STATUSES } from '../constants.js';
import mongoose from 'mongoose';

const communityMessageSchema = new mongoose.Schema({
  // The existing owner record identifies the private PG community.
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  sender: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  senderRole: { type: String, enum: ['owner', 'resident'], required: true, immutable: true },
  senderName: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  text: { type: String, required() { return !this.image?.fileId; }, trim: true, maxlength: MESSAGE_MAX_LENGTH },
  image: { type: new mongoose.Schema({ fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    size: { type: Number, min: 1, max: 5 * 1024 * 1024, required: true } }, { _id: false }), default: undefined },
  kind: { type: String, enum: ['message', 'announcement', 'issue', 'issue-comment'], default: 'message' },
  title: { type: String, trim: true, maxlength: 120, required() { return this.kind === 'issue'; } },
  category: { type: String, enum: COMMUNITY_ISSUE_CATEGORIES, required() { return this.kind === 'issue'; } },
  status: { type: String, enum: COMMUNITY_ISSUE_STATUSES, default: 'Open' },
  roomNumber: { type: String, trim: true, maxlength: 20, default: null },
  parentIssue: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityMessage', index: true },
}, { timestamps: true });

communityMessageSchema.index({ owner: 1, createdAt: -1, _id: -1 });
communityMessageSchema.index({ owner: 1, kind: 1, category: 1, status: 1, createdAt: -1, _id: -1 });
export default mongoose.model('CommunityMessage', communityMessageSchema);
