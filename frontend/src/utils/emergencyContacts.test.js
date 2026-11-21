import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_CATEGORIES, normalizeContactPhone, contactValidation, filterContacts } from './emergencyContacts.js';

test('contact phones support formatted Indian, international and short emergency numbers', () => {
  for (const [input, expected] of [['98765 43210', '+919876543210'], ['91-9876543210', '+919876543210'], ['+44 (7911) 123456', '+447911123456'], ['112', '112'], ['1-0-1', '101']]) assert.equal(normalizeContactPhone(input), expected);
});
test('contact phone validation rejects unsafe dial strings and non-string input', () => {
  for (const input of [null, 112, {}, '12', '000', '+112', '1234567', 'tel:112', '112;123', '+919876543210#', 'javascript:alert(1)', '1'.repeat(51)]) assert.equal(normalizeContactPhone(input), null);
});
test('editor validates supported categories and text limits without requiring descriptions', () => {
  const contact = { name: 'Security', category: 'Security', phone: '112', description: '', priority: true };
  for (const category of CONTACT_CATEGORIES) assert.equal(contactValidation({ ...contact, category }), '');
  for (const extra of [{ name: ' ' }, { name: 'x'.repeat(101) }, { category: 'Unknown' }, { phone: '11' }, { description: 'x'.repeat(1001) }]) assert.ok(contactValidation({ ...contact, ...extra }));
});
test('search and category filters combine while preserving server priority order and source data', () => {
  const rows = [{ name: 'Emergency Desk', category: 'Medical', phone: '112', priority: true, description: '24-hour help' }, { name: 'Caretaker (Night)', category: 'Caretaker', phone: '+919876543210', description: 'Ground floor', priority: false }];
  assert.deepEqual(filterContacts(rows, '  NIGHT ', 'Caretaker'), [rows[1]]);
  assert.deepEqual(filterContacts(rows, 'ground', ''), [rows[1]]);
  assert.deepEqual(filterContacts(rows, '112', ''), [rows[0]]);
  assert.deepEqual(filterContacts(rows, 'Night', 'Medical'), []);
  assert.deepEqual(filterContacts(rows, '.*', ''), []);
  assert.deepEqual(filterContacts(rows, '', ''), rows); assert.equal(rows.length, 2);
});
