import test from 'node:test';
import assert from 'node:assert/strict';
import { MEALS, menuDraft, prepareMenu, hasMenuItems } from './messMenus.js';
import { todayInput, formatDate } from './format.js';

test('drafts preserve all four API meals and produce only the permitted meal fields', () => {
  const menu = { meals: { breakfast: { items: ['Idli', 'Tea'], servingTime: '08:00-09:00', notes: 'Fresh' }, eveningSnacks: { items: ['Fruit'], servingTime: '17:00' } } };
  const draft = menuDraft(menu);
  assert.equal(draft.breakfast.items, 'Idli\nTea');
  assert.equal(draft.eveningSnacks.servingTime, '17:00');
  draft.owner = 'ignored';
  draft.breakfast.items = '  Idli \r\n\n Tea  ';
  const { meals, errors } = prepareMenu(draft);
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(meals), MEALS.map(({ key }) => key));
  assert.deepEqual(meals.breakfast, menu.meals.breakfast);
  assert.deepEqual(meals.dinner, { items: [], servingTime: '', notes: '' });
  assert.deepEqual(menu.meals.breakfast.items, ['Idli', 'Tea']);
});

test('empty menus and clearing food items are supported without inventing serving times', () => {
  const draft = menuDraft(null);
  assert.deepEqual(prepareMenu(draft).errors, {});
  assert.equal(hasMenuItems(null), false);
  assert.equal(hasMenuItems({ meals: prepareMenu(draft).meals }), false);
  draft.dinner = { items: 'Soup', servingTime: '23:30-00:30', notes: '' };
  assert.deepEqual(prepareMenu(draft).errors, {});
  assert.equal(hasMenuItems({ meals: prepareMenu(draft).meals }), true);
  draft.dinner.items = '';
  assert.deepEqual(prepareMenu(draft).meals.dinner.items, []);
});

test('AI drafts replace only selected meals, preserve existing times and use configured times for new dates', () => {
  const menu = { meals: { breakfast: { items: ['Old'], servingTime: '08:15', notes: 'Old note' }, lunch: { items: ['Dal'], servingTime: '13:00', notes: '' } } };
  const suggested = { breakfast: { items: ['Dosa'], notes: 'Reviewed AI idea', servingTime: '09:00' } };
  const draft = menuDraft(menu, suggested);
  assert.equal(draft.breakfast.items, 'Dosa'); assert.equal(draft.breakfast.servingTime, '08:15');
  assert.equal(draft.lunch.items, 'Dal'); assert.equal(draft.lunch.servingTime, '13:00');
  assert.equal(menuDraft(null, suggested).breakfast.servingTime, '09:00');
  assert.deepEqual(menu.meals.breakfast.items, ['Old']);
});

test('meal validation enforces serving times, food limits and optional note limits', () => {
  const draft = menuDraft(null);
  draft.breakfast.items = 'Poha';
  assert.match(prepareMenu(draft).errors['breakfast.servingTime'], /serving time/);
  for (const time of ['25:00', '08:60', '8:00', '08:00-25:00']) {
    draft.breakfast.servingTime = time;
    assert.match(prepareMenu(draft).errors['breakfast.servingTime'], /HH:mm/);
  }
  draft.breakfast.servingTime = '08:00';
  draft.breakfast.items = Array(31).fill('Rice').join('\n');
  assert.match(prepareMenu(draft).errors['breakfast.items'], /30/);
  draft.breakfast.items = 'x'.repeat(121);
  assert.match(prepareMenu(draft).errors['breakfast.items'], /120/);
  draft.breakfast.items = 'x'.repeat(120);
  draft.breakfast.notes = 'x'.repeat(501);
  assert.match(prepareMenu(draft).errors['breakfast.notes'], /500/);
  draft.breakfast.notes = 'x'.repeat(500);
  assert.deepEqual(prepareMenu(draft).errors, {});
});

test('menu date defaults and labels stay on the Indian calendar across UTC midnight', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T18:29:59Z') });
  assert.equal(todayInput(), '2026-11-20');
  t.mock.timers.tick(1000);
  assert.equal(todayInput(), '2026-11-21');
  assert.match(formatDate('2026-11-21'), /21 Nov 2026/);
  t.mock.timers.tick(5.5 * 60 * 60 * 1000);
  assert.equal(todayInput(), '2026-11-21');
});
