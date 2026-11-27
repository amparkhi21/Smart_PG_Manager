import { CONTACT_CATEGORIES } from '../constants.js';
import mongoose from 'mongoose';
import { normalizePhone } from '../utils/residentAuth.js';

export function normalizeContactPhone(value) {
  if (typeof value !== 'string' || value.length > 50) return null;
  const compact = value.replace(/[\s().-]/g, '');
  // Keep short helplines dialable without adding India's country code.
  return /^[1-9]\d{2,5}$/.test(compact) ? compact : normalizePhone(value);
}

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, required: true, enum: CONTACT_CATEGORIES },
  phone: { type: String, required: true, set: (value) => normalizeContactPhone(value) || value,
    validate: { validator: (value) => Boolean(normalizeContactPhone(value)), message: 'Enter a valid phone number or short helpline' } },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  priority: { type: Boolean, default: false },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ owner: 1, priority: -1, name: 1 });
export default mongoose.model('EmergencyContact', schema);
