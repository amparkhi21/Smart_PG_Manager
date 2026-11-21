export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function photoError(file) {
  if (!file) return 'Choose a photo to share.';
  if (!PHOTO_TYPES.includes(file.type)) return 'Choose a JPG, PNG or WebP photo.';
  if (!file.size || file.size > PHOTO_MAX_BYTES) return 'Photos must be between 1 byte and 5 MB.';
  return '';
}
// A selected calendar day expires at its end in India, regardless of the device timezone.
export const noticeExpiry = (date) => date ? `${date}T23:59:59.999+05:30` : null;
