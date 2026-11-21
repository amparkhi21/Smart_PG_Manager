import mongoose from 'mongoose';

export const COMPLAINT_CATEGORIES = ['Maintenance', 'Electricity', 'Water', 'Wi-Fi', 'Cleaning', 'Food', 'Other'];
export const COMPLAINT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const COMPLAINT_STATUSES = ['Open', 'In Progress', 'Resolved'];

const complaintSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true },
  residentName: { type: String, required: true, maxlength: 80, immutable: true },
  residentRoomNumber: { type: String, required: true, immutable: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null, immutable: true },
  roomNumber: { type: String, default: null, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  description: { type: String, required: true, trim: true, maxlength: 5000, immutable: true },
  category: { type: String, enum: COMPLAINT_CATEGORIES, required: true, immutable: true },
  priority: { type: String, enum: COMPLAINT_PRIORITIES, default: 'Medium', immutable: true },
  status: { type: String, enum: COMPLAINT_STATUSES, default: 'Open' },
  resolutionNote: { type: String, trim: true, maxlength: 2000, default: '' },
  resolvedAt: { type: Date, default: null },
  reopenedAt: { type: Date, default: null },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true, optimisticConcurrency: true });

complaintSchema.index({ owner: 1, resident: 1, createdAt: -1, _id: -1 });
complaintSchema.index({ owner: 1, status: 1, category: 1, priority: 1, createdAt: -1 });
export default mongoose.model('Complaint', complaintSchema);
