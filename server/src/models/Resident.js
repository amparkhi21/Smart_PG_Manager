import mongoose from 'mongoose';

const residentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 80 },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\+?[0-9]{10,13}$/, 'Enter a valid phone number'],
    },
    email: { type: String, trim: true, lowercase: true },
    joiningDate: { type: Date, required: true, default: Date.now },
    monthlyRent: { type: Number, required: true, min: 0 },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    status: { type: String, enum: ['Active', 'Left'], default: 'Active' },
    leftDate: { type: Date },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Residents are never hard-deleted by default: mark them "Left" to keep history.
residentSchema.index({ owner: 1, status: 1 });
residentSchema.index({ owner: 1, room: 1 });

export default mongoose.model('Resident', residentSchema);