/**
 * Sync helpers — shared between client and server.
 * The actual VPS fetch happens via /api/sync (Next.js API route)
 * so the secret token stays server-side.
 */
import type { SleepRecord, SyncPayload } from './types';

// ── Mi Fitness CSV parser ─────────────────────────────────────────────────────

export function parseMiFitnessSleepCsv(csv: string): Omit<SleepRecord, 'id'>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const now = new Date().toISOString();
  const records: Omit<SleepRecord, 'id'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 8) continue;
    const [dateRaw, start, stop, total, deep, light, rem, wake, score] = cols;
    const date = (dateRaw || '').split(' ')[0];
    if (!date) continue;

    records.push({
      date,
      sleep_start:     extractTime(start),
      sleep_end:       extractTime(stop),
      duration_min:    toInt(total),
      deep_sleep_min:  toInt(deep),
      light_sleep_min: toInt(light),
      rem_sleep_min:   toInt(rem),
      awake_min:       toInt(wake),
      sleep_score:     toInt(score),
      hr_avg: 0, hr_min: 0, hr_max: 0, steps: 0,
      imported_at: now,
    });
  }
  return records;
}

function extractTime(raw: string): string {
  const m = (raw || '').match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function toInt(raw: string | undefined): number {
  const n = Number((raw || '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n);
}

// ── Week helpers ──────────────────────────────────────────────────────────────

export function currentWeekStart(): string {
  const now = new Date();
  const day  = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().split('T')[0];
}

export function isMonday(): boolean {
  return new Date().getDay() === 1;
}
