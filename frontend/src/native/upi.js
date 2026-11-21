import { isAndroid, Native } from './platform.js';
import { validUpiId } from '../utils/upiPayments.js';

export async function openUpi(url, { native = isAndroid, bridge = Native, navigate = (value) => window.location.assign(value) } = {}) {
  const parsed = new URL(url);
  const amount = parsed.searchParams.get('am');
  if (parsed.protocol !== 'upi:' || parsed.hostname !== 'pay' || parsed.pathname || parsed.username || parsed.password || parsed.port || parsed.hash
      || !validUpiId(parsed.searchParams.get('pa')) || !parsed.searchParams.get('pn')?.trim() || parsed.searchParams.get('cu') !== 'INR'
      || !/^\d+\.\d{2}$/.test(amount || '') || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Invalid UPI payment link');
  if (native) await bridge.openExternal({ url });
  else navigate(url);
}
