import { isAndroid, Native } from './platform.js';

export function validateExternalUrl(value) {
  const url = new URL(value);
  if (!['https:', 'tel:', 'mailto:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('This external link is not supported.');
  }
  return url.href;
}

// Reserve a browser tab synchronously during the tap to preserve popup behavior.
// Android hands the approved URL to an external app instead of navigating the WebView.
export function prepareExternalLink(value) {
  const url = validateExternalUrl(value);
  if (isAndroid) return { open: () => Native.openExternal({ url }), close() {} };
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Allow pop-ups to open WhatsApp, then try again.');
  popup.opener = null;
  return { open() { popup.location.href = url; }, close() { popup.close(); } };
}

export async function copyText(text) {
  if (isAndroid) await Native.copyText({ text });
  else await navigator.clipboard.writeText(text);
}
