import MessMenu from '../models/MessMenu.js';
import { MEAL_KEYS } from '../constants.js';
import ApiError from '../utils/ApiError.js';

import { todayIST } from '../utils/dates.js';

const view = (menu) => ({
  id: menu._id, date: menu.date,
  meals: Object.fromEntries(MEAL_KEYS.map((key) => [key, {
    items: menu.meals?.[key]?.items || [], servingTime: menu.meals?.[key]?.servingTime || '', notes: menu.meals?.[key]?.notes || '',
  }])),
  createdAt: menu.createdAt, updatedAt: menu.updatedAt,
});

function applyMeals(menu, meals = {}) {
  for (const key of MEAL_KEYS) {
    if (meals[key] === undefined) continue;
    for (const field of ['items', 'servingTime', 'notes']) {
      if (meals[key][field] !== undefined) menu.meals[key][field] = meals[key][field];
    }
  }
}

async function ownedMenu(context) {
  const menu = await MessMenu.findOne({ owner: context.owner._id, date: context.identifiers.date });
  if (!menu) throw new ApiError(404, 'Mess menu not found');
  return menu;
}

export const createMessMenu = async (context) => {
  // Await the unique index before admitting concurrent first-time creates.
  await MessMenu.init();
  const menu = new MessMenu({ owner: context.owner._id, date: context.input.date });
  applyMeals(menu, context.input.meals);
  try { await menu.save(); } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'A mess menu already exists for this date');
    throw error;
  }
  return { message: 'Mess menu created', data: view(menu) };
};

export const listMessMenus = async (context) => {
  const { from, to } = context.filters;
  if (from && to && from > to) throw new ApiError(400, 'From date must be on or before to date');
  const scope = { owner: context.owner._id };
  if (from || to) scope.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const menus = await MessMenu.find(scope).sort({ date: 1 }).lean();
  return { count: menus.length, data: menus.map(view) };
};

export const getMessMenu = async (context) => {
  return { data: view(await ownedMenu(context)) };
};

export const updateMessMenu = async (context) => {
  const menu = await ownedMenu(context);
  applyMeals(menu, context.input.meals);
  try { await menu.save(); } catch (error) {
    if (error.name === 'DocumentNotFoundError') throw new ApiError(404, 'Mess menu not found');
    throw error;
  }
  return { message: 'Mess menu updated', data: view(menu) };
};

export const deleteMessMenu = async (context) => {
  const deleted = await MessMenu.findOneAndDelete({ owner: context.owner._id, date: context.identifiers.date });
  if (!deleted) throw new ApiError(404, 'Mess menu not found');
  return { message: 'Mess menu deleted' };
};

export const getTodaysMessMenu = async (context) => {
  const date = todayIST();
  const menu = await MessMenu.findOne({ owner: context.resident.owner, date }).lean();
  return { data: { date, menu: menu ? view(menu) : null } };
};

export const getUpcomingMessMenus = async (context) => {
  const date = todayIST();
  const menus = await MessMenu.find({ owner: context.resident.owner, date: { $gt: date } }).sort({ date: 1 }).lean();
  return { count: menus.length, data: { date, menus: menus.map(view) } };
};
