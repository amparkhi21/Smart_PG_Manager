export const fixtureMeal = (label = 'Idli') => ({ items: [label, 'Chutney'], explanation: 'A practical Indian meal for a PG kitchen.', ingredientNotes: 'Use seasonal ingredients.', vegetarian: true });
export function fixturePlan(input, label = 'Idli') {
  if (input.mode !== 'weekly') return { suggestions: Array.from({ length: input.mode === 'meal' ? 1 : 3 }, (_, index) => fixtureMeal(`${label} ${index + 1}`)), warnings: [] };
  return { meals: Array.from({ length: input.days }, (_, index) => ['breakfast', 'lunch', 'eveningSnacks', 'dinner'].map((meal) => ({
    date: new Date(Date.parse(`${input.date}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10), meal,
    items: [`${label} ${meal} ${index + 1}`, 'Chutney'], vegetarian: true,
  }))).flat(), warnings: [] };
}
