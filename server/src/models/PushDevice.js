import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  recipientRole: { type: String, enum: ['owner', 'resident'], required: true, immutable: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  deviceId: { type: String, required: true, maxlength: 128, immutable: true },
  platform: { type: String, enum: ['android'], default: 'android', immutable: true },
  tokenHash: { type: String, required: true, select: false },
  tokenCiphertext: { type: String, required: true, select: false },
  tokenIv: { type: String, required: true, select: false },
  tokenTag: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: null, select: false },
  revision: { type: Number, default: 0, select: false },
}, { timestamps: true, toJSON: { transform(doc, value) {
  for (const key of ['tokenHash', 'tokenCiphertext', 'tokenIv', 'tokenTag', 'sessionVersion', 'revision']) delete value[key];
  return value;
} } });
// One installation/token cannot subscribe to multiple accounts or PGs simultaneously.
schema.index({ deviceId: 1 }, { unique: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ owner: 1, recipientRole: 1, recipient: 1 });
export default mongoose.model('PushDevice', schema);
