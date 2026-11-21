import mongoose from 'mongoose';
import { notificationOutbox } from './notificationOutbox.js';

const noticeSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  pinned: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });
noticeSchema.index({ owner: 1, pinned: -1, createdAt: -1 });
noticeSchema.plugin(notificationOutbox);
export default mongoose.model('Notice', noticeSchema);
