/**
 * Persistent device identifier stored in localStorage.
 * Same UUID on one browser = one "device".
 * Share it manually to merge data across devices.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('sk_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sk_device_id', id);
  }
  return id;
}
