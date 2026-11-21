import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPLAINT_CATEGORIES, complaintErrors, searchComplaints, complaintPage, fetchComplaintSearch } from './complaints.js';

const valid = { title: 'Door lock broken', description: 'The bathroom lock does not open.', category: 'Maintenance', priority: 'High' };
test('complaint validation follows API text limits, categories and priorities', () => {
  assert.deepEqual(complaintErrors(valid), {});
  assert.deepEqual(COMPLAINT_CATEGORIES, ['Maintenance', 'Electricity', 'Water', 'Wi-Fi', 'Cleaning', 'Food', 'Other']);
  for (const category of COMPLAINT_CATEGORIES) assert.deepEqual(complaintErrors({ ...valid, category }), {});
  for (const bad of [{ title: ' ' }, { title: 'x'.repeat(121) }, { description: '' }, { description: 'x'.repeat(5001) }, { category: 'Public' }, { priority: 'Critical' }]) assert.ok(Object.keys(complaintErrors({ ...valid, ...bad })).length);
  assert.deepEqual(complaintErrors({ ...valid, title: 'x'.repeat(120), description: 'x'.repeat(5000) }), {});
});
test('search matches title, description, resident and original or referenced room without modifying records', () => {
  const records = [{ id: '1', ...valid, resident: { fullName: 'Asha Kumar', roomNumberAtCreation: '101' }, room: { roomNumber: '202' }, status: 'Open' }, { id: '2', ...valid, title: 'Water supply', description: 'Tap is dry.', category: 'Water', resident: { fullName: 'Dev', roomNumberAtCreation: '303' }, status: 'Resolved' }];
  assert.deepEqual(searchComplaints(records, 'ASHA 202 LOCK').map((row) => row.id), ['1']);
  assert.deepEqual(searchComplaints(records, 'resolved water').map((row) => row.id), ['2']);
  assert.equal(searchComplaints(records, '').length, 2); assert.equal(searchComplaints(records, 'missing').length, 0);
  assert.equal(records[0].resident.fullName, 'Asha Kumar');
});
test('search consumes authorized API pages and finds complaints beyond the first page without inventing search parameters', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = { get: async (endpoint, options) => {
    calls.push({ endpoint, params: options.params }); assert.equal(options.signal, signal);
    const page = options.params.page;
    return { data: { data: { complaints: page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: String(index), title: 'Maintenance ' + index })) : [{ id: '100', title: 'Unique Wi-Fi issue' }], pagination: { hasMore: page === 1 } } } };
  } };
  const rows = await fetchComplaintSearch(api, '/resident/complaints', { status: 'Open' }, signal);
  assert.equal(rows.length, 101); assert.deepEqual(searchComplaints(rows, 'unique').map((row) => row.id), ['100']);
  assert.deepEqual(calls, [1, 2].map((page) => ({ endpoint: '/resident/complaints', params: { status: 'Open', page, limit: 100 } })));
});
test('search pagination is bounded and abandoned requests do not fetch another account or filter page', async () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: String(index) }));
  assert.equal(complaintPage(rows, 1).complaints.length, 20);
  assert.deepEqual(complaintPage(rows, 99).complaints, [{ id: '20' }]); assert.equal(complaintPage(rows, 99).pagination.page, 2);
  assert.deepEqual(complaintPage([], 1).complaints, []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchComplaintSearch({ get: () => assert.fail('Cancelled request ran') }, '/complaints', {}, controller.signal), /cancelled/);
});
