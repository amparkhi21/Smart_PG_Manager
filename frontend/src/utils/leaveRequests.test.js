import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveDuration, leaveErrors, normalizeEmergencyContact, searchLeaveRequests, leavePage, fetchLeaveSearch } from './leaveRequests.js';
import { todayInput, formatDate } from './format.js';

const form = { fromDate: '2026-11-25', toDate: '2026-11-27', reason: 'Visiting family.', emergencyContact: '' };
const row = (id, extra = {}) => ({ id, reason: 'Visiting family', status: 'Pending', response: '', fromDate: form.fromDate, toDate: form.toDate, resident: { fullName: 'Asha Kumar' }, room: { roomNumber: '101' }, ...extra });
test('leave dates use inclusive calendar duration, leap years and Indian midnight', (t) => {
  assert.equal(leaveDuration('2026-12-31', '2027-01-02'), 3);
  assert.equal(leaveDuration('2028-02-28', '2028-03-01'), 3);
  assert.equal(leaveDuration('2026-11-25', '2026-11-25'), 1);
  for (const dates of [['2026-02-30', '2026-03-01'], ['2026-13-01', '2026-13-02'], ['2026-11-26', '2026-11-25']]) assert.equal(leaveDuration(...dates), null);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T18:45:00Z') });
  assert.equal(todayInput(), '2026-11-21'); assert.match(formatDate('2026-11-25'), /25 Nov 2026/);
});
test('leave validation follows backend date, text, duration and emergency-phone limits', () => {
  assert.deepEqual(leaveErrors(form, '2026-11-21'), {});
  for (const bad of [{ fromDate: '2026-11-20' }, { toDate: '2026-11-24' }, { toDate: '2027-11-25' }, { reason: ' ' }, { reason: 'x'.repeat(2001) }, { emergencyContact: 'bad phone' }]) assert.ok(Object.keys(leaveErrors({ ...form, ...bad }, '2026-11-21')).length);
  assert.equal(normalizeEmergencyContact('+91 (98765) 43210'), '+919876543210');
  assert.deepEqual(leaveErrors({ ...form, reason: 'x'.repeat(2000), emergencyContact: '+91 (98765) 43210' }, '2026-11-21'), {});
});
test('leave search and pagination include reason, resident, room, status, owner response and calendar dates', () => {
  const rows = [row('1'), row('2', { reason: 'Examination', status: 'Approved', response: 'Best wishes', room: { roomNumber: '202' } })];
  assert.deepEqual(searchLeaveRequests(rows, 'ASHA 202 Approved wishes').map((value) => value.id), ['2']);
  assert.deepEqual(searchLeaveRequests(rows, '2026-11-25 family').map((value) => value.id), ['1']);
  assert.deepEqual(searchLeaveRequests(rows, 'missing'), []);
  const many = Array.from({ length: 21 }, (_, index) => row(String(index)));
  assert.equal(leavePage(many, 1).requests.length, 20); assert.deepEqual(leavePage(many, 90).requests.map((value) => value.id), ['20']); assert.equal(leavePage(many, 90).pagination.page, 2);
});
test('search reads only existing authorized leave API pages, deduplicates overlap and stops after cancellation', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = { get: async (endpoint, options) => { calls.push({ endpoint, params: options.params }); assert.equal(options.signal, signal); return { data: { data: { requests: options.params.page === 1 ? [row('1')] : [row('1'), row('2', { reason: 'Off-page match' })], pagination: { hasMore: options.params.page === 1 } } } }; } };
  const rows = await fetchLeaveSearch(api, '/resident/leave-requests', { status: 'Pending' }, signal);
  assert.equal(rows.length, 2); assert.equal(searchLeaveRequests(rows, 'Off-page')[0].id, '2');
  assert.deepEqual(calls, [1, 2].map((page) => ({ endpoint: '/resident/leave-requests', params: { status: 'Pending', page, limit: 100 } })));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchLeaveSearch({ get: () => assert.fail('Cancelled fetch ran') }, '/leave-requests', {}, controller.signal), /cancelled/);
});
