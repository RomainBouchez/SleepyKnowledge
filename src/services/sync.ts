/**
 * Sync service — pulls sleep data from the VPS/n8n endpoint.
 *
 * The VPS Python script posts a JSON payload to n8n.
 * n8n stores/serves the latest export at SYNC_ENDPOINT_URL.
 * The app fetches that URL, parses the payload and upserts records into SQLite.
 *
 * Payload format (set by the Python script, see scripts/xiaomi_export.py):
 * {
 *   "sleep": [{ date, sleep_start, sleep_end, duration_min, … }],
 *   "generatedAt": "<ISO timestamp>"
 * }
 */

import Config from 'react-native-config';
import {upsertSleepRecord, todayStr} from './database';
import {SleepRecord, SyncPayload} from '../types';

export type SyncResult =
  | {success: true; imported: number; generatedAt: string}
  | {success: false; error: string};

export async function syncFromVps(): Promise<SyncResult> {
  const url = Config.SYNC_ENDPOINT_URL;
  if (!url) {
    return {success: false, error: 'SYNC_ENDPOINT_URL non configurée dans .env'};
  }

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (Config.SYNC_SECRET_TOKEN) {
    headers['X-SleepIQ-Token'] = Config.SYNC_SECRET_TOKEN;
  }

  let payload: SyncPayload;
  try {
    const res = await fetch(url, {method: 'GET', headers});
    if (!res.ok) {
      return {success: false, error: `HTTP ${res.status}: ${res.statusText}`};
    }
    payload = (await res.json()) as SyncPayload;
  } catch (e) {
    return {success: false, error: e instanceof Error ? e.message : 'Réseau inaccessible'};
  }

  if (!Array.isArray(payload.sleep)) {
    return {success: false, error: 'Payload invalide — champ "sleep" manquant'};
  }

  let imported = 0;
  const now = new Date().toISOString();
  for (const raw of payload.sleep) {
    const record: Omit<SleepRecord, 'id'> = {
      date:            raw.date,
      sleep_start:     raw.sleep_start ?? '',
      sleep_end:       raw.sleep_end   ?? '',
      duration_min:    Number(raw.duration_min)   || 0,
      deep_sleep_min:  Number(raw.deep_sleep_min)  || 0,
      light_sleep_min: Number(raw.light_sleep_min) || 0,
      rem_sleep_min:   Number(raw.rem_sleep_min)   || 0,
      awake_min:       Number(raw.awake_min)        || 0,
      sleep_score:     Number(raw.sleep_score)      || 0,
      hr_avg:          Number(raw.hr_avg)           || 0,
      hr_min:          Number(raw.hr_min)           || 0,
      hr_max:          Number(raw.hr_max)           || 0,
      steps:           Number(raw.steps)            || 0,
      imported_at:     now,
    };
    await upsertSleepRecord(record);
    imported++;
  }

  return {success: true, imported, generatedAt: payload.generatedAt ?? now};
}

// ── Mi Fitness CSV parser (for manual import) ─────────────────────────────────
// Column order in Mi Fitness SLEEP export:
// date,start,stop,totalSleepTime,deepSleepTime,shallowSleepTime,REMTime,wakeTime,score

export function parseMiFitnessSleepCsv(csv: string): Omit<SleepRecord, 'id'>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) {return [];}

  const now = new Date().toISOString();
  const records: Omit<SleepRecord, 'id'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 8) {continue;}

    const [dateRaw, start, stop, total, deep, light, rem, wake, score] = cols;
    const date = dateRaw.split(' ')[0]; // keep only YYYY-MM-DD

    records.push({
      date,
      sleep_start:     formatCsvTime(start),
      sleep_end:       formatCsvTime(stop),
      duration_min:    parseMin(total),
      deep_sleep_min:  parseMin(deep),
      light_sleep_min: parseMin(light),
      rem_sleep_min:   parseMin(rem),
      awake_min:       parseMin(wake),
      sleep_score:     Number(score) || 0,
      hr_avg: 0, hr_min: 0, hr_max: 0, // filled by HEARTRATE_AUTO CSV if available
      steps: 0,                          // filled by ACTIVITY CSV if available
      imported_at: now,
    });
  }
  return records;
}

function formatCsvTime(raw: string): string {
  // Mi Fitness exports as "HH:MM" or "YYYY-MM-DD HH:MM:SS" — extract HH:MM
  const match = raw.match(/(\d{2}:\d{2})/);
  return match ? match[1] : raw;
}

function parseMin(raw: string): number {
  const n = Number(raw);
  return isNaN(n) ? 0 : Math.round(n);
}

// ── Week start helper (Monday) ────────────────────────────────────────────────
export function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

export function isMonday(): boolean {
  return new Date().getDay() === 1;
}
