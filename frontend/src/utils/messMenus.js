export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'eveningSnacks', label: 'Snacks' },
  { key: 'dinner', label: 'Dinner' },
];

const SERVING_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?$/;

export function menuDraft(menu, suggestions) {
  return Object.fromEntries(MEALS.map(({ key }) => [key, {
    items: (suggestions?.[key]?.items || menu?.meals?.[key]?.items || []).join('\n'),
    servingTime: menu?.meals?.[key]?.servingTime ?? suggestions?.[key]?.servingTime ?? '',
    notes: suggestions?.[key]?.notes ?? menu?.meals?.[key]?.notes ?? '',
  }]));
}

// Keep the four-meal payload and limits aligned with the existing menu API.
export function prepareMenu(draft) {
  const errors = {}, meals = {};
  for (const { key } of MEALS) {
    const items = draft[key].items.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const servingTime = draft[key].servingTime.trim(), notes = draft[key].notes.trim();
    if (items.length > 30) errors[`${key}.items`] = 'Use at most 30 food items.';
    else if (items.some((item) => item.length > 120)) errors[`${key}.items`] = 'Keep each food item within 120 characters.';
    if (items.length && !servingTime) errors[`${key}.servingTime`] = 'Add a serving time for this meal.';
    else if (servingTime && !SERVING_TIME.test(servingTime)) errors[`${key}.servingTime`] = 'Use HH:mm or HH:mm-HH:mm, for example 08:00-09:00.';
    if (notes.length > 500) errors[`${key}.notes`] = 'Keep notes within 500 characters.';
    meals[key] = { items, servingTime, notes };
  }
  return { meals, errors };
}

export const hasMenuItems = (menu) => MEALS.some(({ key }) => menu?.meals?.[key]?.items?.length > 0);
