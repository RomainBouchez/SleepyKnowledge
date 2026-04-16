/**
 * Client-side helpers to push/pull data from Neon via API routes.
 * All functions fire-and-forget errors (logged, not thrown) so IndexedDB
 * always works even when offline.
 */
import type { SleepRecord, LifestyleLog, AiInsight } from './types';

// ── Sleep ─────────────────────────────────────────────────────────────────────

export async function pushSleepRecords(
  deviceId: string,
  records: Omit<SleepRecord, 'id'>[]
): Promise<void> {
  if (!deviceId || !records.length) return;
  try {
    await fetch('/api/db/sleep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, records }),
    });
  } catch (e) {
    console.warn('[cloud-sync] pushSleepRecords failed (offline?)', e);
  }
}

export async function pullSleepRecords(
  deviceId: string,
  days = 90
): Promise<Omit<SleepRecord, 'id'>[]> {
  if (!deviceId) return [];
  try {
    const res = await fetch(`/api/db/sleep?device_id=${deviceId}&days=${days}`);
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    console.warn('[cloud-sync] pullSleepRecords failed (offline?)', e);
    return [];
  }
}

// ── Lifestyle ─────────────────────────────────────────────────────────────────

export async function pushLifestyleLogs(
  deviceId: string,
  logs: Omit<LifestyleLog, 'id'>[]
): Promise<void> {
  if (!deviceId || !logs.length) return;
  try {
    await fetch('/api/db/lifestyle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, logs }),
    });
  } catch (e) {
    console.warn('[cloud-sync] pushLifestyleLogs failed (offline?)', e);
  }
}

export async function pullLifestyleLogs(
  deviceId: string,
  days = 90
): Promise<Omit<LifestyleLog, 'id'>[]> {
  if (!deviceId) return [];
  try {
    const res = await fetch(`/api/db/lifestyle?device_id=${deviceId}&days=${days}`);
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    console.warn('[cloud-sync] pullLifestyleLogs failed (offline?)', e);
    return [];
  }
}

// ── AI insights ───────────────────────────────────────────────────────────────

export async function pushAiInsight(
  deviceId: string,
  insight: Omit<AiInsight, 'id'>
): Promise<void> {
  if (!deviceId) return;
  try {
    await fetch('/api/db/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, insight }),
    });
  } catch (e) {
    console.warn('[cloud-sync] pushAiInsight failed (offline?)', e);
  }
}

export async function pullAiInsights(
  deviceId: string,
  limit = 30
): Promise<Omit<AiInsight, 'id'>[]> {
  if (!deviceId) return [];
  try {
    const res = await fetch(`/api/db/insights?device_id=${deviceId}&limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    console.warn('[cloud-sync] pullAiInsights failed (offline?)', e);
    return [];
  }
}
