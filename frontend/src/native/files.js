import { isAndroid, Native } from './platform.js';

export async function exportFile(blob, filename, mimeType, { native = isAndroid, bridge = Native } = {}) {
  if (native) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > 16 * 1024 * 1024) throw new Error('This file is too large to share. Export a smaller report.');
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    }
    await bridge.shareFile({ filename, mimeType, data: btoa(chunks.join('')) });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
