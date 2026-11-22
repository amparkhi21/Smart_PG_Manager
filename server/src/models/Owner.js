import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ownerSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['owner'], default: 'owner', immutable: true },
    occupancyRevision: { type: Number, select: false },
    occupancyLockToken: { type: String, select: false },
    occupancyLockExpiresAt: { type: Date, select: false },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    // PG joining credentials are separate from owner login and resident sessions.
    pgJoiningPasswordHash: { type: String, select: false },
    pgJoiningPasswordUpdatedAt: { type: Date },
    phone: { type: String, trim: true },
    pgName: { type: String, required: [true, 'PG name is required'], trim: true, maxlength: 100 },
    upiId: { type: String, trim: true, maxlength: 320, default: '' },
    address: { type: String, trim: true, maxlength: 300 },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: '₹' },
    defaultElectricityRate: { type: Number, default: 8, min: 0 },
    rentDueDay: { type: Number, default: 5, min: 1, max: 28 },
    reminderSettings: {
      templates: {
        pendingRent: { type: String, default: '' },
        overdueRent: { type: String, default: '' },
        pendingElectricity: { type: String, default: '' },
        overdueElectricity: { type: String, default: '' },
      },
      preferredTiming: { type: String, enum: ['Anytime', 'Morning', 'Afternoon', 'Evening'], default: 'Anytime' },
      duplicateWarningHours: { type: Number, min: 1, max: 720, default: 24 },
      suggestionsEnabled: { type: Boolean, default: true },
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ownerSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

ownerSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model('Owner', ownerSchema);
