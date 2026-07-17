// Thin fetch wrapper around the /api routes — the only file that knows
// about HTTP. A future swap (different backend, different auth) only
// touches this file and api/*.
import { getStoredPassword, clearStoredPassword } from './auth.js';

export class UnauthorizedError extends Error {}

async function request(path, options = {}) {
  const isWrite = options.method && options.method !== 'GET';
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (isWrite) headers['x-editor-password'] = getStoredPassword();

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearStoredPassword();
    throw new UnauthorizedError('Editor password was rejected — please unlock editing again.');
  }
  if (!res.ok) {
    let message = `Request to ${path} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* response wasn't JSON */ }
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
