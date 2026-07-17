// Editor-password state. This is a soft client-side lock — the real check
// happens server-side in api/_auth.js on every write; storing the password
// here just avoids re-prompting on every click within a browser tab.
const STORAGE_KEY = 'wt-editor-password';

export function getStoredPassword() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}
export function setStoredPassword(password) {
  try {
    sessionStorage.setItem(STORAGE_KEY, password);
  } catch {
    /* sessionStorage unavailable (e.g. privacy mode) — password just won't persist across reloads */
  }
}
export function clearStoredPassword() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
export function isUnlocked() {
  return !!getStoredPassword();
}
