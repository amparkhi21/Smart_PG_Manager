import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentAmountError, claimErrors, upiIntent, validUpiId } from './upiPayments.js';
import { openUpi } from '../native/upi.js';

const bill = { id: '123456789012345678901234', billType: 'Rent', month: '2026-11' };
const options = { upiId: 'owner.name@bank', payeeName: 'Owner & PG', amount: '1250.50', available: 4000, bill };
test('UPI links encode the configured recipient, partial amount and actual bill reference without generating a UTR', () => {
  const url = new URL(upiIntent(options));
  assert.equal(url.protocol, 'upi:'); assert.equal(url.hostname, 'pay');
  assert.deepEqual(Object.fromEntries(url.searchParams), { pa: options.upiId, pn: 'Owner & PG', am: '1250.50', cu: 'INR', tr: bill.id, tn: 'Rent 2026-11' });
  assert.equal(url.searchParams.has('utr'), false);
  for (const upiId of ['', null, 'javascript:alert(1)', 'owner@bank&pa=evil@bank']) assert.equal(upiIntent({ ...options, upiId }), null);
  assert.equal(upiIntent({ ...options, payeeName: '' }), null);
  assert.equal(upiIntent({ ...options, amount: '4000.01' }), null);
  assert.equal(validUpiId(' owner.name@bank '), true);
});
test('payment amounts reject overclaims, invalid precision, missing balances and non-finite amounts', () => {
  for (const value of ['', '0', '-1', '1.001', '1e3', 'Infinity', '100.01']) assert.ok(paymentAmountError(value, 100));
  assert.ok(paymentAmountError('1', undefined));
  for (const value of ['0.01', '10.10', '100']) assert.equal(paymentAmountError(value, 100), '');
});
test('claim validation requires the actual UTR and a real non-future Indian date', () => {
  const form = { amount: '25', utr: '', paymentDate: '2026-11-20' };
  assert.match(claimErrors(form, 100, '2026-11-20').utr, /actual UPI/);
  form.utr = '412345678901';
  assert.deepEqual(claimErrors(form, 100, '2026-11-20'), {});
  for (const paymentDate of ['2026-02-30', '2026-13-01', '2026-11-21', '', '2026-11-20T00:00:00Z']) assert.ok(claimErrors({ ...form, paymentDate }, 100, '2026-11-20').paymentDate);
});
test('native and web UPI handoffs only launch a validated link; no payment result is trusted', async () => {
  const link = upiIntent(options), calls = [];
  await openUpi(link, { native: true, bridge: { openExternal: async (payload) => { calls.push(payload); return { status: 'SUCCESS', utr: 'ignored' }; } } });
  assert.deepEqual(calls, [{ url: link }]);
  await openUpi(link, { native: false, navigate: (value) => calls.push(value) });
  assert.equal(calls[1], link);
  for (const invalid of ['https://evil.test', 'upi://evil?am=1', 'upi://pay/path?am=1', 'upi://pay?pa=owner@bank&pn=Owner&am=0.00&cu=INR']) await assert.rejects(openUpi(invalid, { native: false, navigate: () => assert.fail('Invalid link was launched') }));
});
