import { GENERAL_REQUEST_CATEGORIES, GENERAL_REQUEST_PRIORITIES, GENERAL_REQUEST_STATUSES } from '../constants.js';
import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true },
  ownerName: { type: String, required: true, maxlength: 80 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

const generalRequestSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true, index: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true, immutable: true, index: true },
  residentName: { type: String, required: true, maxlength: 80, immutable: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, immutable: true },
  roomNumber: { type: String, required: true, maxlength: 20, immutable: true },
  bedNumber: { type: String, maxlength: 20, default: null, immutable: true },
  category: { type: String, enum: GENERAL_REQUEST_CATEGORIES, required: true, immutable: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120, immutable: true },
  description: { type: String, required: true, trim: true, minlength: 5, maxlength: 3000, immutable: true },
  priority: { type: String, enum: GENERAL_REQUEST_PRIORITIES, default: 'Normal' },
  status: { type: String, enum: GENERAL_REQUEST_STATUSES, default: 'Open' },
  responses: { type: [responseSchema], default: [] },
  resolvedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });

generalRequestSchema.index({ owner: 1, status: 1, createdAt: -1, _id: -1 });
generalRequestSchema.index({ owner: 1, category: 1, createdAt: -1, _id: -1 });
generalRequestSchema.index({ owner: 1, resident: 1, createdAt: -1, _id: -1 });

export default mongoose.model('GeneralRequest', generalRequestSchema);
