import { base44 } from '@/api/base44Client';
import { items } from '@/lib/school';

let cache = null;
let cachedAt = 0;
const TTL = 60_000;
const listeners = new Set();

export function getSchoolSettings(force = false) {
  if (!cache || force || Date.now() - cachedAt > TTL) {
    cachedAt = Date.now();
    cache = base44.entities.SchoolSettings.list({ limit: 1 })
      .then((res) => items(res)[0] || {})
      .catch(() => ({}));
  }
  return cache;
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshSchoolSettings() {
  cache = null;
  cachedAt = 0;
  const record = await getSchoolSettings(true);
  listeners.forEach((fn) => fn(record));
  return record;
}