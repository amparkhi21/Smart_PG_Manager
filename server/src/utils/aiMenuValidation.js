import ApiError from './ApiError.js';
import { isRealDate, todayIST } from './dates.js';
import { MEAL_KEYS } from '../constants.js';

const NON_VEG = /\b(chicken|mutton|fish|eggs?|beef|pork|bacon|ham|prawns?|shrimps?|seafood|meat|lamb|salmon|tuna|gelatin|lard|keema|kheema)\b|चिकन|मटन|मछली|अंड[ाे]|अण्ड[ाे]|मांस|झींग/iu;
export const plannerError = (statusCode, code, message, providerStatus) => Object.assign(new ApiError(statusCode, message), {
  code, ...(Number.isInteger(providerStatus) && providerStatus >= 400 && providerStatus <= 599 && { providerStatus }),
});
export const invalid = () => plannerError(502, 'GEMINI_INVALID_RESPONSE', 'Gemini returned an invalid menu. Please regenerate.');
const text = (value, max, empty = false) => typeof value === 'string' && (empty || value.trim().length > 0) && value.length <= max;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
export const offsetDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const allMeals = (input) => input.mode === 'daily' && input.meal === 'all';

export function plannerInput(body) {
  if (!exactKeys(body, ['mode', 'date', 'days', 'meal', 'diet', 'preference', 'budget', 'budgetScope', 'prompt', 'avoid', 'owner', 'pgId'])) throw new ApiError(400, 'Invalid menu planner inputs');
  const { mode, date, diet, preference } = body;
  let realDate = false;
  try { realDate = isRealDate(date); } catch { /* Invalid calendar inputs are a 400. */ }
  if (!['daily', 'meal'].includes(mode) || !realDate || date < todayIST()
    || date > offsetDate(todayIST(), 365) || !['vegetarian', 'nonVegetarian'].includes(diet)
    || !['healthy', 'budget', 'highProtein'].includes(preference)
    || !(MEAL_KEYS.includes(body.meal) || (mode === 'daily' && body.meal === 'all'))
    || (body.days !== undefined && body.days !== 1)
    || (body.budgetScope !== undefined && !['day', 'meal'].includes(body.budgetScope))
    || (allMeals(body) && body.budgetScope === 'meal')
    || (body.prompt !== undefined && !text(body.prompt, 1500, true))
    || (body.budget !== undefined && (typeof body.budget !== 'number' || !Number.isFinite(body.budget) || body.budget < 1 || body.budget > 2000))
    || (body.avoid !== undefined && (!Array.isArray(body.avoid) || body.avoid.length > 60 || body.avoid.some((item) => !text(item, 120))))) {
    throw new ApiError(400, 'Check the planner date, meal, dietary preference, budget and instructions (maximum 1500 characters).');
  }
  return { mode, date, diet, preference, days: 1, meal: body.meal,
    ...(body.budget !== undefined && { budget: body.budget }), budgetScope: body.budgetScope || (allMeals(body) ? 'day' : 'meal'),
    prompt: body.prompt?.trim() || '', avoid: body.avoid || [] };
}

const stringSchema = (maxLength) => ({ type: 'string', maxLength });
const mealSchema = {
  type: 'object', additionalProperties: false, required: ['items', 'explanation', 'ingredientNotes', 'vegetarian'],
  properties: { items: { type: 'array', minItems: 1, maxItems: 8, items: { ...stringSchema(120), minLength: 1 } },
    explanation: { ...stringSchema(240), minLength: 1 }, ingredientNotes: stringSchema(240), vegetarian: { type: 'boolean' } },
};
export function plannerSchema(input) {
  const warnings = { type: 'array', maxItems: 6, items: stringSchema(240) };
  if (!allMeals(input)) return { type: 'object', additionalProperties: false, required: ['suggestions', 'warnings'], properties: {
    suggestions: { type: 'array', minItems: input.mode === 'meal' ? 1 : 3, maxItems: input.mode === 'meal' ? 1 : 5, items: mealSchema }, warnings,
  } };
  // Four flat meal rows keep the schema small. Enforce the date, exact meal
  // coverage and food limits in application validation, not nested constraints.
  return { type: 'object', additionalProperties: false, required: ['meals', 'warnings'], properties: {
    meals: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['date', 'meal', 'items', 'vegetarian'], properties: {
        date: { type: 'string' }, meal: { type: 'string', enum: MEAL_KEYS },
        items: { type: 'array', items: { type: 'string' } }, vegetarian: { type: 'boolean' },
      } } }, warnings: { type: 'array', items: { type: 'string' } },
  } };
}

export function validatePlannerOutput(raw, input, history = []) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 64000) throw invalid();
  let data;
  try { data = JSON.parse(raw); } catch { throw invalid(); }
  if (!exactKeys(data, allMeals(input) ? ['meals', 'warnings'] : ['suggestions', 'warnings'])
    || !Array.isArray(data.warnings) || data.warnings.length > 6 || data.warnings.some((warning) => !text(warning, 240))) throw invalid();
  const validateMeal = (meal) => {
    if (!exactKeys(meal, ['items', 'explanation', 'ingredientNotes', 'vegetarian']) || !Array.isArray(meal.items) || !meal.items.length || meal.items.length > 8
      || meal.items.some((item) => !text(item, 120)) || !text(meal.explanation, 240, allMeals(input)) || !text(meal.ingredientNotes, 240, true)
      || typeof meal.vegetarian !== 'boolean') throw invalid();
    if (input.diet === 'vegetarian' && (!meal.vegetarian || NON_VEG.test([...meal.items, meal.ingredientNotes].join(' ')))) {
      throw plannerError(502, 'GEMINI_DIET_MISMATCH', 'Gemini returned a meal that does not meet Vegetarian Only. Please regenerate.');
    }
    return { ...meal, items: meal.items.map((item) => item.trim()), explanation: meal.explanation.trim(), ingredientNotes: meal.ingredientNotes.trim() };
  };
  let result, meals;
  if (allMeals(input)) {
    if (!Array.isArray(data.meals) || data.meals.length !== MEAL_KEYS.length) throw invalid();
    const grouped = new Map([[input.date, {}]]);
    for (const meal of data.meals) {
      if (!exactKeys(meal, ['date', 'meal', 'items', 'vegetarian']) || !grouped.has(meal.date)
        || !MEAL_KEYS.includes(meal.meal) || Object.hasOwn(grouped.get(meal.date), meal.meal)) throw invalid();
      grouped.get(meal.date)[meal.meal] = validateMeal({ items: meal.items, vegetarian: meal.vegetarian, explanation: '', ingredientNotes: '' });
    }
    const dayMeals = grouped.get(input.date);
    if (MEAL_KEYS.some((key) => !Object.hasOwn(dayMeals, key))) throw invalid();
    result = { date: input.date, meals: Object.fromEntries(MEAL_KEYS.map((key) => [key, dayMeals[key]])) };
    meals = Object.values(result.meals);
  } else {
    if (!Array.isArray(data.suggestions) || data.suggestions.length < (input.mode === 'meal' ? 1 : 3) || data.suggestions.length > (input.mode === 'meal' ? 1 : 5)) throw invalid();
    meals = data.suggestions.map(validateMeal); result = { suggestions: meals };
  }
  const canonical = (item) => item.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const previous = new Set([...history.flatMap((day) => Object.values(day.meals).flat()), ...input.avoid].map(canonical));
  let repeated = false;
  for (const meal of meals) for (const item of meal.items) { const key = canonical(item); if (previous.has(key)) repeated = true; if (allMeals(input)) previous.add(key); }
  return { ...result, warnings: [...data.warnings, ...(repeated ? ['Some dishes repeat recent or planned meals. Review variety; strict non-repetition may not be practical with your constraints.'] : [])] };
}
