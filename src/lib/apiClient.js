// Thin fetch wrapper around the /api routes — the only file that knows
// about HTTP. A future swap (different backend, different auth) only
// touches this file and api/*.
import { getStoredPassword, clearStoredPassword } from './auth.js';

export class UnauthorizedError extends Error {}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  // Attach whenever we have one, not just on writes — /api/feedback requires
  // it on GET too (editor-only read, unlike /api/items). Harmless no-op
  // header on public endpoints that don't check it.
  const stored = getStoredPassword();
  if (stored) headers['x-editor-password'] = stored;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearStoredPassword();
    throw new UnauthorizedError('Editor password was rejected — please unlock editing again.');
  }
  if (!res.ok) {
    let message = `Request to ${path} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.code ? `${body.error} (${body.code})` : body.error;
    } catch { /* response wasn't JSON — likely a platform-level crash page, not our API */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchItems() {
  const data = await request('/api/items');
  return data.items;
}
export async function createItem(draft) {
  const data = await request('/api/items', { method: 'POST', body: JSON.stringify(draft) });
  return data.item;
}
export async function updateItem(id, patch) {
  const data = await request(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.item;
}
export async function deleteItem(id) {
  await request(`/api/items/${id}`, { method: 'DELETE' });
}
export async function clearSampleItems() {
  await request('/api/items?sample=true', { method: 'DELETE' });
}
export async function clearAllItems() {
  await request('/api/items?all=true', { method: 'DELETE' });
}
export async function seedIfEmpty() {
  return request('/api/items/seed', { method: 'POST' });
}
export async function fetchConfig() {
  const data = await request('/api/config');
  return data.config;
}
export async function updateConfig(patch) {
  const data = await request('/api/config', { method: 'PATCH', body: JSON.stringify(patch) });
  return data.config;
}

export async function fetchFeedback() {
  const data = await request('/api/feedback');
  return data.entries;
}
export async function createFeedback(entry) {
  const data = await request('/api/feedback', { method: 'POST', body: JSON.stringify(entry) });
  return data.entry;
}
export async function updateFeedback(id, patch) {
  const data = await request(`/api/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.entry;
}
export async function deleteFeedback(id) {
  await request(`/api/feedback/${id}`, { method: 'DELETE' });
}

export async function fetchCalendarSettings() {
  const data = await request('/api/calendar/settings');
  return data.settings;
}
export async function updateCalendarSettings(patch) {
  const data = await request('/api/calendar/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  return data.settings;
}
export async function fetchCalendarSuggestions() {
  return request('/api/calendar/suggestions');
}
export async function fetchCalendarEvents() {
  const data = await request('/api/calendar/events');
  return data.events;
}
export async function createCalendarEvent(entry) {
  const data = await request('/api/calendar/events', { method: 'POST', body: JSON.stringify(entry) });
  return data.event;
}
export async function deleteCalendarEvent(id) {
  await request(`/api/calendar/events/${id}`, { method: 'DELETE' });
}

export async function fetchSnapshots() {
  const data = await request('/api/snapshots');
  return data.snapshots;
}
export async function createSnapshot() {
  const data = await request('/api/snapshots', { method: 'POST' });
  return data.snapshots;
}
export async function restoreSnapshot(id) {
  const data = await request(`/api/snapshots/${id}/restore`, { method: 'POST' });
  return data.items;
}
