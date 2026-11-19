// Exercise minified, browser-targeted export utilities without real data or messages.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, loadEnv } from 'vite';
import { resolveApiBaseUrl } from '../src/api/config.js';

const output = resolve('test-results/production-utils');
await build({
  configFile: false, publicDir: false, logLevel: 'warn',
  build: {
    outDir: output, emptyOutDir: true, minify: true,
    lib: {
      entry: {
        pdf: resolve('src/utils/pdf.js'), reports: resolve('src/utils/reports.js'), reminders: resolve('src/utils/reminders.js'),
        apiConfig: resolve('src/api/config.js'), apiClient: resolve('src/api/http.js'),
      },
      formats: ['es'], fileName: (_format, name) => `${name}.js`,
    },
  },
});
const pdf = await import(pathToFileURL(resolve(output, 'pdf.js')));
const reports = await import(pathToFileURL(resolve(output, 'reports.js')));
const reminders = await import(pathToFileURL(resolve(output, 'reminders.js')));
const apiConfig = await import(pathToFileURL(resolve(output, 'apiConfig.js')));
const { createApiClient } = await import(pathToFileURL(resolve(output, 'apiClient.js')));
const expectedApiUrl = resolveApiBaseUrl(loadEnv('production', process.cwd(), 'VITE_').VITE_API_BASE_URL, true);
for (const configured of [undefined, 'http://localhost:5000/api', expectedApiUrl]) {
  const api = createApiClient({
    baseURL: apiConfig.resolveApiBaseUrl(configured, true),
    storage: { getItem: () => null }, onUnauthorized() {},
  });
  let loginUrl;
  api.defaults.adapter = async (config) => {
    loginUrl = api.getUri(config);
    return { status: 200, data: {}, headers: {}, config };
  };
  await api.post('/auth/login', {});
  assert.equal(loginUrl, `${configured === expectedApiUrl ? expectedApiUrl : apiConfig.PRODUCTION_API_BASE_URL}/auth/login`);
  assert.ok(!loginUrl.includes('/api/api/'));
}
const payment = { _id: 'synthetic-payment-1', amount: 100, paidOn: '2026-11-01T00:00:00Z', method: 'Cash' };
const data = {
  month: '2026-11', owner: { pgName: 'Synthetic PG' },
  rooms: [{ _id: 'room-1', roomNumber: '101', capacity: 2, currentResidents: 1 }],
  residents: [{ fullName: '=formula-test', phone: 'CONTACT-MUST-NOT-EXPORT', status: 'Active', room: { roomNumber: '101' } }],
  attendance: [],
  rentRecords: [{ month: '2026-11', amountDue: 200, amountPaid: 100, balance: 100, payments: [payment], resident: { fullName: 'Synthetic Resident' }, room: { roomNumber: '101' } }],
  electricityBills: [{ month: '2026-11', amount: 200, units: 25, ratePerUnit: 8, amountPaid: 100, balance: 100, payments: [payment], room: { roomNumber: '101' } }],
};
for (const [type, record] of [['Rent', data.rentRecords[0]], ['Electricity', data.electricityBills[0]]]) {
  const document = await pdf.createPaymentReceipt(type, record, payment, data.owner);
  assert.match(document.output(), /^%PDF-/);
  assert.match(document.output(), /Payment Recorded/);
}
const report = reports.summarizeReport(data);
assert.match((await pdf.createMonthlyReportPdf({ data, report })).output(), /^%PDF-/);
for (const kind of ['rooms', 'residents', 'attendance', 'rent-records', 'rent-payments', 'electricity-bills', 'electricity-payments', 'monthly-summary']) {
  const csv = reports.createCsv(kind, data, data.month);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(!csv.includes('CONTACT-MUST-NOT-EXPORT'));
}
assert.match(reports.createCsv('residents', data, data.month), /'=formula-test/);

// Verify the browser download handoff with a synthetic anchor; no browser is opened.
let clicked = false;
const anchor = { click() { clicked = true; }, remove() {} };
globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
await reports.downloadCsv('residents', data, data.month);
assert.ok(clicked);
assert.equal(anchor.download, 'residents-2026-11.csv');
assert.match(anchor.href, /^blob:/);
delete globalThis.document;
const url = reminders.createWhatsAppUrl('+91 98765 43210', 'Synthetic & test');
assert.equal(url, 'https://wa.me/919876543210?text=Synthetic%20%26%20test');

// Inspect the actual application bundle, not only the utility test bundle.
const assets = await readdir(resolve('dist/assets'));
const javascript = (await Promise.all(assets.filter((name) => name.endsWith('.js')).map((name) => readFile(resolve('dist/assets', name), 'utf8')))).join('\n');
assert.doesNotMatch(javascript, /https?:\/\/(localhost|127\.0\.0\.1)(?=[:/])/);
assert.ok(javascript.includes(JSON.stringify(expectedApiUrl)), 'Application bundle must contain the resolved production API URL');
assert.doesNotMatch(javascript, /\/api\/api(?:\/|["'`])/);
console.log(`Production API checks passed: ${expectedApiUrl}/auth/login; missing/localhost fallback and single /api prefix verified in compiled utilities.`);
console.log('Production artifact checks passed: two receipt PDFs, monthly report PDF, eight CSV formats, CSV download handoff, encoded WhatsApp link, and no loopback API URL in application JS.');
console.log('Synthetic data only. Native browser PDF saving, popup behavior, and hosted Vercel routing still require manual verification.');
