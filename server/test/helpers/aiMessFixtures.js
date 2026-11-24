export const fixtureMeal = (label = 'Idli') => ({ items: [label, 'Chutney'], explanation: 'A practical Indian meal for a PG kitchen.', ingredientNotes: 'Use seasonal ingredients.', vegetarian: true });
export function fixturePlan(input, label = 'Idli') {
  if (input.meal !== 'all') return { suggestions: Array.from({ length: input.mode === 'meal' ? 1 : 3 }, (_, index) => fixtureMeal(`${label} ${index + 1}`)), warnings: [] };
  return { meals: ['breakfast', 'lunch', 'eveningSnacks', 'dinner'].map((meal) => ({
    date: input.date, meal, items: [`${label} ${meal}`, 'Chutney'], vegetarian: true,
  })), warnings: [] };
}
