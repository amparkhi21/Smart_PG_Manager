import MessMenu, { MEAL_KEYS } from '../models/MessMenu.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
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

async function ownedMenu(req) {
  const menu = await MessMenu.findOne({ owner: req.owner._id, date: req.params.date });
  if (!menu) throw new ApiError(404, 'Mess menu not found');
  return menu;
}

export const createMessMenu = asyncHandler(async (req, res) => {
  // Await the unique index before admitting concurrent first-time creates.
  await MessMenu.init();
  const menu = new MessMenu({ owner: req.owner._id, date: req.body.date });
  applyMeals(menu, req.body.meals);
  try { await menu.save(); } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'A mess menu already exists for this date');
    throw error;
  }
  res.status(201).json({ success: true, message: 'Mess menu created', data: view(menu) });
});

export const listMessMenus = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (from && to && from > to) throw new ApiError(400, 'From date must be on or before to date');
  const scope = { owner: req.owner._id };
  if (from || to) scope.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const menus = await MessMenu.find(scope).sort({ date: 1 }).lean();
  res.json({ success: true, count: menus.length, data: menus.map(view) });
});

export const getMessMenu = asyncHandler(async (req, res) => {
  res.json({ success: true, data: view(await ownedMenu(req)) });
});

export const updateMessMenu = asyncHandler(async (req, res) => {
  const menu = await ownedMenu(req);
  applyMeals(menu, req.body.meals);
  try { await menu.save(); } catch (error) {
    if (error.name === 'DocumentNotFoundError') throw new ApiError(404, 'Mess menu not found');
    throw error;
  }
  res.json({ success: true, message: 'Mess menu updated', data: view(menu) });
});

export const deleteMessMenu = asyncHandler(async (req, res) => {
  const deleted = await MessMenu.findOneAndDelete({ owner: req.owner._id, date: req.params.date });
  if (!deleted) throw new ApiError(404, 'Mess menu not found');
  res.json({ success: true, message: 'Mess menu deleted' });
});

export const getTodaysMessMenu = asyncHandler(async (req, res) => {
  const date = todayIST();
  const menu = await MessMenu.findOne({ owner: req.resident.owner, date }).lean();
  res.json({ success: true, data: { date, menu: menu ? view(menu) : null } });
});

export const getUpcomingMessMenus = asyncHandler(async (req, res) => {
  const date = todayIST();
  const menus = await MessMenu.find({ owner: req.resident.owner, date: { $gt: date } }).sort({ date: 1 }).lean();
  res.json({ success: true, count: menus.length, data: { date, menus: menus.map(view) } });
});
