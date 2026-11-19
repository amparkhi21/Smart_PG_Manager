let pending = 0;
export function requestActivity(change) {
  pending = Math.max(0, pending + change);
  window.dispatchEvent(new CustomEvent('api:activity', { detail: pending }));
}
