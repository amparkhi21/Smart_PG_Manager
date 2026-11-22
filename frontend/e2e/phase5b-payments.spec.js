import { test, expect } from '@playwright/test';

const MONTH = '2026-11', TODAY = '2026-11-20';
const owner = { id: '111111111111111111111111', name: 'Owner & PG', role: 'owner', email: 'owner@example.test', phone: '', pgName: 'Test PG', rentDueDay: 5, defaultElectricityRate: 8 };
const resident = { id: '222222222222222222222222', role: 'resident', fullName: 'Resident A', pgName: owner.pgName, pgId: owner.id, room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const newClaim = () => ({ id: '666666666666666666666666', billType: 'Rent', billId: '444444444444444444444444', month: MONTH, amount: 250.5, utr: '412345678901', paymentDate: TODAY + 'T06:30:00.000Z', status: 'Pending Verification', createdAt: TODAY + 'T09:00:00.000Z', reviewNote: null });
async function setup(page, { ownerView = false, upiId = 'owner.name@bank', pending = false, conflict = false } = {}) {
  const bills = [
    { id: '444444444444444444444444', billType: 'Rent', month: MONTH, amountDue: 5000, amountPaid: 1000, balance: 4000, dueDate: '2026-11-25T18:29:59Z', status: 'Partially Paid', pendingClaimAmount: 0, pendingClaims: 0, claimableAmount: 4000 },
    { id: '555555555555555555555555', billType: 'Electricity', month: MONTH, amountDue: 800, amountPaid: 0, balance: 800, dueDate: '2026-11-25T18:29:59Z', status: 'Pending', pendingClaimAmount: 0, pendingClaims: 0, claimableAmount: 800 },
  ];
  const state = { bills, claims: pending ? [newClaim()] : [], upiId, writes: [], conflict };
  const unified = (claim) => ({ id: `payment:${claim.id}`, sourceType: 'payment', sourceId: claim.id,
    category: 'Payment Verification', title: `${claim.billType} payment · ${claim.month}`,
    description: `Claimed ${claim.amount} against ${claim.billType} bill. UTR: ${claim.utr}`, priority: 'Normal',
    status: claim.status, createdAt: claim.createdAt, ownerResponse: claim.reviewNote || '',
    resident: { id: resident.id, name: resident.fullName }, room: { number: '101', bedNumber: null },
    details: { billType: claim.billType, month: claim.month, amount: claim.amount, utr: claim.utr, paymentDate: claim.paymentDate,
      bill: (() => { const bill = bills.find((item) => item.id === claim.billId); return bill && { amountPaid: bill.amountPaid, balance: bill.balance }; })() } });
  const update = () => { for (const bill of bills) { const pendingClaims = state.claims.filter((claim) => claim.billId === bill.id && claim.status === 'Pending Verification'); bill.pendingClaimAmount = pendingClaims.reduce((sum, claim) => sum + claim.amount, 0); bill.pendingClaims = pendingClaims.length; bill.claimableAmount = bill.balance - bill.pendingClaimAmount; } };
  update();
  await page.clock.setFixedTime(new Date(TODAY + 'T09:00:00Z'));
  await page.addInitScript((token) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', token); }, ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(4), method = request.method();
    const isOwner = request.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200, message = 'Saved', extra = {}) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message, ...extra } });
    if (path === '/auth/session') return reply(isOwner ? { owner: { ...owner, upiId: state.upiId } } : { role: 'resident', resident });
    if (method !== 'GET') state.writes.push({ method, path, body: request.postDataJSON() });
    if (path === '/residents' && method === 'GET') return reply([]);
    if (path === '/settings') {
      if (method === 'PATCH') state.upiId = request.postDataJSON().upiId;
      return reply({ owner: { ...owner, upiId: state.upiId } }, 200, 'Settings saved');
    }
    if (path === '/resident/payments/details') return reply({ upiId: state.upiId || null, payeeName: owner.name, pgName: owner.pgName });
    if (path === '/resident/payments/bills') { update(); return reply(bills.filter((bill) => bill.balance > 0)); }
    if (path === '/resident/payments/history') return reply(bills.filter((bill) => bill.month === url.searchParams.get('month')).map((bill) => ({ ...bill, ...(bill.billType === 'Rent' && { payments: [{ id: 'payment-cash', amount: 1000, method: 'Cash', paidOn: '2026-11-02T06:30:00Z' }] }) })));
    if (path === '/resident/payments/claims') {
      if (method === 'POST') {
        const body = request.postDataJSON();
        state.claims.push({ ...newClaim(), ...body, paymentDate: body.paymentDate + 'T06:30:00.000Z' }); update();
        return reply(state.claims.at(-1), 201, 'Claim submitted. Pending Verification');
      }
      return reply(state.claims);
    }
    if ((path === '/requests' || path === '/resident/requests') && method === 'GET') {
      const status = url.searchParams.get('status'), category = url.searchParams.get('category');
      const claims = state.claims.filter((claim) => (!status || status === claim.status) && (!category || category === 'Payment Verification')).map(unified);
      return reply({ requests: claims, pagination: { page: 1, limit: 20, total: claims.length, totalPages: claims.length ? 1 : 0, hasMore: false } });
    }
    const detailMatch = path.match(/^(?:\/resident)?\/requests\/payment\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const claim = state.claims.find((value) => value.id === detailMatch[1]);
      return claim ? reply(unified(claim)) : reply('Request not found', 404);
    }
    if (path.startsWith('/payment-claims/') && method === 'POST') {
      const claim = state.claims.find((value) => value.id === path.split('/')[2]);
      if (state.conflict) { claim.status = 'Approved'; return reply('This claim was already approved', 409); }
      if (path.endsWith('/approve')) {
        if (request.postDataJSON().verifiedReceipt !== true) return reply('Verify actual receipt first', 400);
        if (claim.status !== 'Pending Verification') return reply('Claim already reviewed', 409);
        claim.status = 'Approved'; claim.reviewNote = request.postDataJSON().note;
        const bill = bills.find((value) => value.id === claim.billId); bill.amountPaid += claim.amount; bill.balance -= claim.amount;
      } else { claim.status = 'Rejected'; claim.reviewNote = request.postDataJSON().reason; }
      update(); return reply(claim, 200, claim.status === 'Approved' ? 'Claim approved and payment recorded' : 'Claim rejected. The bill was not changed.');
    }
    return reply('Unexpected test endpoint', 404);
  });
  return state;
}
async function ownerSession(page) { await page.evaluate(() => localStorage.setItem('pg_token', 'owner-token')); await page.goto('/requests'); }

test('resident partial claim stays pending; owner records it only after explicit receipt confirmation', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/resident/payments');
  const outstanding = page.getByRole('region', { name: 'Outstanding bills', exact: true });
  const rent = outstanding.getByRole('article', { name: 'Rent ' + MONTH, exact: true });
  await rent.getByRole('button', { name: 'Pay Now', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const amount = dialog.locator('#claim-amount');
  await expect(amount).toBeEnabled(); await amount.fill('4000.01');
  await dialog.getByRole('button', { name: 'Submit payment claim', exact: true }).click();
  await expect(dialog.getByText('Amount exceeds the available balance after pending claims.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await amount.fill('250.50');
  const link = await dialog.getByRole('button', { name: 'Open UPI app', exact: true }).getAttribute('data-upi-intent');
  const intent = new URL(link); expect(intent.searchParams.get('pa')).toBe(state.upiId); expect(intent.searchParams.get('am')).toBe('250.50'); expect(intent.searchParams.get('cu')).toBe('INR'); expect(intent.searchParams.get('tr')).toBe(state.bills[0].id);
  await expect(dialog.locator('#claim-utr')).toHaveValue(''); expect(state.claims).toHaveLength(0); expect(state.bills[0].balance).toBe(4000);
  await expect(dialog.getByText(/Manual payment: open your UPI app/)).toBeVisible();
  await dialog.locator('#claim-utr').fill('412345678901'); await dialog.locator('#claim-date').fill(TODAY);
  const claimResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/resident/payments/claims');
  await dialog.getByRole('button', { name: 'Submit payment claim', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await claimResponse;
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Payment claims', exact: true }).getByText('Pending Verification', { exact: true })).toBeVisible();
  await expect.poll(() => state.writes.filter((entry) => entry.path === '/resident/payments/claims').length).toBe(1); expect(state.bills[0].balance).toBe(4000);
  await ownerSession(page);
  const card = page.getByRole('article').filter({ hasText: 'Resident A' });
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  const requestDialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(requestDialog.getByText('412345678901', { exact: true })).toBeVisible();
  await requestDialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(requestDialog.getByRole('button', { name: 'Confirm approved', exact: true })).toBeDisabled();
  expect(state.writes.some((entry) => entry.path.endsWith('/approve'))).toBe(false);
  await requestDialog.getByRole('checkbox', { name: 'I verified the actual payment in my bank or UPI account.', exact: true }).check();
  const approvalResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/payment-claims/666666666666666666666666/approve'));
  await requestDialog.getByRole('button', { name: 'Confirm approved', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await approvalResponse;
  await expect.poll(() => state.writes.filter((entry) => entry.path.endsWith('/approve')).length).toBe(1); expect(state.bills[0].balance).toBe(3749.5);
  expect(state.writes.find((entry) => entry.path.endsWith('/approve')).body.verifiedReceipt).toBe(true);
  await expect(card.getByText('Approved', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  expect(state.writes.every((entry) => !entry.path.startsWith('/rent/') && !entry.path.startsWith('/electricity/'))).toBe(true);
});

test('mobile shared-room electricity has no invented share and missing UPI details never produce a payment link', async ({ page }) => {
  const state = await setup(page, { upiId: '' });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/payments');
  await expect(page.getByText('Your owner has not configured a UPI ID yet. Contact your owner for payment details.', { exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Outstanding bills', exact: true }).getByRole('article', { name: 'Electricity ' + MONTH, exact: true }).getByRole('button', { name: 'Pay Now', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#claim-amount')).toBeEnabled(); await expect(dialog.locator('#claim-amount')).toHaveValue('');
  await expect(dialog.getByText(/The figures are room totals; no individual share has been assigned/)).toBeVisible();
  await dialog.locator('#claim-amount').fill('100');
  await expect(dialog.getByRole('button', { name: 'Open UPI app', exact: true })).toHaveCount(0); await expect(dialog.getByRole('button', { name: 'Copy UPI ID', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Your owner has not configured a valid UPI ID/)).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Monthly payment history', exact: true }).getByText(/No individual share or another resident's payment details/)).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'My Bills & Payments', exact: true })).toHaveAttribute('href', '/resident/payments');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('owner rejection preserves the bill and a stale approval reports the backend conflict', async ({ page }) => {
  const state = await setup(page, { ownerView: true, pending: true }); await page.goto('/requests');
  const card = page.getByRole('article'); await card.getByRole('button', { name: 'Details', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
  await dialog.getByLabel('Reply or reason (optional)', { exact: true }).fill('Money not received');
  const rejectionResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/payment-claims/666666666666666666666666/reject'));
  await dialog.getByRole('button', { name: 'Confirm rejected', exact: true }).click();
  await rejectionResponse;
  await expect.poll(() => state.claims[0].status).toBe('Rejected'); expect(state.bills[0].balance).toBe(4000);
  await expect(card.getByText('Owner response: Money not received', { exact: true })).toBeVisible();
  state.claims.push({ ...newClaim(), id: '777777777777777777777777', utr: '512345678901' }); state.conflict = true;
  await page.reload();
  const conflictCard = page.getByRole('article').nth(1);
  await conflictCard.getByRole('button', { name: 'Details', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  const conflictResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/payment-claims/777777777777777777777777/approve'));
  await dialog.getByRole('button', { name: 'Confirm approved', exact: true }).click();
  await conflictResponse;
  await expect(dialog.getByRole('alert')).toHaveText('This claim was already approved');
  await expect(dialog.getByRole('button', { name: 'Confirm approved', exact: true })).toHaveCount(0);
  await expect.poll(() => state.writes.filter((entry) => entry.path.endsWith('/approve')).length).toBe(1);
});

test('owner configures a validated UPI ID through existing settings and mobile navigation exposes payment requests', async ({ page }) => {
  const state = await setup(page, { ownerView: true, upiId: '' }); await page.goto('/settings');
  const input = page.getByLabel('Payment UPI ID', { exact: true }); await input.fill('invalid-upi');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid payment UPI ID' })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await input.fill('owner.name@bank'); await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect.poll(() => state.upiId).toBe('owner.name@bank');
  expect(state.writes[0].path).toBe('/settings'); expect(state.writes[0].body.rentDueDay).toBe(5); expect(state.bills[0].balance).toBe(4000);
  await page.setViewportSize({ width: 360, height: 800 }); await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'More', exact: true }).getByRole('link', { name: 'Requests', exact: true })).toHaveAttribute('href', '/requests');
});
