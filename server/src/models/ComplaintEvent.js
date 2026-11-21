import mongoose from 'mongoose';
import { COMPLAINT_STATUSES } from './Complaint.js';
import { notificationOutbox } from './notificationOutbox.js';

// A private append-only timeline, kept outside the complaint so history can grow and be paginated.
const complaintEventSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  actorRole: { type: String, enum: ['owner', 'resident'], required: true, immutable: true },
  actorName: { type: String, required: true, maxlength: 80, immutable: true },
  type: { type: String, enum: ['Created', 'Comment', 'Status Changed', 'Reopened'], required: true, immutable: true },
  text: { type: String, trim: true, maxlength: 2000, default: '', immutable: true },
  fromStatus: { type: String, enum: COMPLAINT_STATUSES, immutable: true },
  toStatus: { type: String, enum: COMPLAINT_STATUSES, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

complaintEventSchema.index({ owner: 1, complaint: 1, createdAt: 1, _id: 1 });
complaintEventSchema.plugin(notificationOutbox);
export default mongoose.model('ComplaintEvent', complaintEventSchema);
