/**
 * sqlite-mi-parser.ts
 * Parse le fichier 8292589056.db (Mi Fitness) directement dans le browser via sql.js (WASM).
 */

import type { SleepRecord } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MiSleepRaw {
  bedtime: number;
  wake_up_time: number;
  duration: number;
  sleep_deep_duration?: number;
  sleep_light_duration?: number;
  sleep_rem_duration?: number;
  avg_hr?: number;
  min_hr?: number;
  max_hr?: number;
  items?: Array<{ start_time: number; end_time: number; state: number }>;
}

export interface SqliteParseResult {
  sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[];
  stats: { totalSleep: number; dateRange: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToDateStr(unix: number): string {
  return new Date(unix * 1000).toISOString().split('T')[0];
}

function unixToTimeStr(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Score sommeil 0-100.
 * Durée (0-40pts): optimal 420-540 min | Profond (0-30pts): ~20% | REM (0-30pts): ~20%
 */
function calcSleepScore(duration: number, deep: number, rem: number): number {
  if (duration <= 0) return 0;
  let durScore: number;
  if (duration < 300)       durScore = 0;
  else if (duration < 420)  durScore = Math.floor(40 * (duration - 300) / 120);
  else if (duration <= 540) durScore = 40;
  else                      durScore = Math.max(20, 40 - Math.floor((duration - 540) / 30));
  return Math.min(100,
    durScore +
    Math.min(30, Math.floor((deep / duration) * 150)) +
    Math.min(30, Math.floor((rem  / duration) * 150))
  );
}

/**
 * Remapping états SQLite bruts → états app.
 * SQLite (Redmi Watch): 1=REM, 2=léger, 3=profond, 4=éveillé
 * App STAGE_CONFIG:     2=REM, 3=léger, 4=profond, 5=éveillé
 */
function remapStage(s: number): number {
  switch (s) {
    case 1: return 2;
    case 2: return 3;
    case 3: return 4;
    case 4: return 5;
    default: return s;
  }
}

// ── sql.js CDN loader ─────────────────────────────────────────────────────────

const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0';

type SqlJsStatic = {
  Database: new (data: Uint8Array) => {
    exec: (sql: string) => Array<{ values: unknown[][] }>;
    close: () => void;
  };
};

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (f: string) => string }) => Promise<SqlJsStatic>;
  }
}

async function loadSqlJsFromCDN(): Promise<SqlJsStatic> {
  if (!window.initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${SQL_JS_CDN}/sql-wasm.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger sql.js depuis CDN'));
      document.head.appendChild(script);
    });
  }
  return window.initSqlJs!({ locateFile: (f: string) => `${SQL_JS_CDN}/${f}` });
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Parse un fichier .db Mi Fitness directement (pas de ZIP).
 * Lit les tables `sleep` et `steps_day`, retourne SleepRecord[] prêts à importer.
 */
export async function parseMiFitnessDb(
  file: File,
  onProgress: (pct: number) => void
): Promise<SqliteParseResult> {
  onProgress(5);

  // Lire le fichier comme ArrayBuffer
  const buffer = await file.arrayBuffer();
  onProgress(20);

  // Charger sql.js depuis CDN via <script> tag — bypass webpack bundling
  const SQL = await loadSqlJsFromCDN();
  onProgress(40);
  onProgress(55);

  const db = new SQL.Database(new Uint8Array(buffer));

  // Pas quotidiens → enrichir chaque nuit
  const stepsByDate = new Map<string, number>();
  try {
    const res = db.exec('SELECT value FROM steps_day ORDER BY id');
    if (res.length > 0) {
      for (const row of res[0].values) {
        const d = JSON.parse(row[0] as string);
        if (d.time) stepsByDate.set(unixToDateStr(d.time), d.steps ?? 0);
      }
    }
  } catch { /* table absente = pas grave */ }

  onProgress(65);

  // Nuits de sommeil
  const sleepRes = db.exec('SELECT value FROM sleep ORDER BY id');
  const sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[] = [];

  if (sleepRes.length > 0) {
    const rows = sleepRes[0].values;
    rows.forEach((row, i) => {
      try {
        const raw: MiSleepRaw = JSON.parse(row[0] as string);
        if (!raw.bedtime || !raw.wake_up_time || !raw.duration) return;

        const deep  = raw.sleep_deep_duration  ?? 0;
        const light = raw.sleep_light_duration ?? 0;
        const rem   = raw.sleep_rem_duration   ?? 0;
        const date  = unixToDateStr(raw.bedtime);

        sleepRecords.push({
          date,
          sleep_start:       unixToTimeStr(raw.bedtime),
          sleep_end:         unixToTimeStr(raw.wake_up_time),
          duration_min:      raw.duration,
          deep_sleep_min:    deep,
          light_sleep_min:   light,
          rem_sleep_min:     rem,
          awake_min:         Math.max(0, raw.duration - deep - light - rem),
          sleep_score:       calcSleepScore(raw.duration, deep, rem),
          hr_avg:            raw.avg_hr ?? 0,
          hr_min:            raw.min_hr ?? 0,
          hr_max:            raw.max_hr ?? 0,
          steps:             stepsByDate.get(date) ?? 0,
          sleep_stages_json: raw.items?.length
            ? JSON.stringify(raw.items.map(it => ({ ...it, state: remapStage(it.state) })))
            : undefined,
        });
      } catch { /* ligne corrompue, skip */ }
      if (i % 20 === 0) onProgress(65 + Math.floor((i / rows.length) * 30));
    });
  }

  db.close();
  onProgress(100);

  const dates = sleepRecords.map(r => r.date).sort();
  return {
    sleepRecords,
    stats: {
      totalSleep: sleepRecords.length,
      dateRange:  dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : 'aucune',
    },
  };
}
