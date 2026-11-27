import { MEAL_KEYS, SERVING_TIME_RE } from '../constants.js';
import mongoose from 'mongoose';
import { isRealDate } from '../utils/dates.js';

// Local Indian time: HH:mm, or a serving window such as 08:00-09:00.

const mealSchema = new mongoose.Schema({
  items: {
    type: [{ type: String, trim: true, maxlength: 120, match: /\S/ }], default: [],
    validate: { validator: (items) => items.length <= 30, message: 'Use at most 30 food items per meal' },
  },
  servingTime: {
    type: String, trim: true, default: '',
    validate: {
      validator(value) { return value === '' ? this.items.length === 0 : SERVING_TIME_RE.test(value); },
      message: 'Provide a serving time in HH:mm or HH:mm-HH:mm Indian local time for meals with food items',
    },
  },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const messMenuSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  // A calendar date rather than UTC midnight, so scheduling never shifts a day.
  date: { type: String, required: true, immutable: true, validate: { validator: isRealDate, message: 'Enter a real date in YYYY-MM-DD format' } },
  meals: Object.fromEntries(MEAL_KEYS.map((key) => [key, { type: mealSchema, default: () => ({}) }])),
}, { timestamps: true, optimisticConcurrency: true });

messMenuSchema.index({ owner: 1, date: 1 }, { unique: true, name: 'one_mess_menu_per_pg_date' });
export default mongoose.model('MessMenu', messMenuSchema);
