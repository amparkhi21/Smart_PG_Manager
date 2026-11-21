import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, immutable: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'PushDevice', required: true, immutable: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  recipientRole: { type: String, enum: ['owner', 'resident'], required: true, immutable: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  status: { type: String, enum: ['attempted', 'sent', 'failed', 'skipped'], required: true },
  errorCode: { type: String, maxlength: 80 },
  attemptedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ notification: 1, device: 1 }, { unique: true });
schema.index({ owner: 1, recipientRole: 1, recipient: 1, createdAt: -1 });
export default mongoose.model('PushDelivery', schema);
