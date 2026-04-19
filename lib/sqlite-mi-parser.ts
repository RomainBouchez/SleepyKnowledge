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
  sleep_awake_duration?: number;
  avg_hr?: number;
  min_hr?: number;
  max_hr?: number;
  items?: Array<{ start_time: number; end_time: number; state: number }>;
}

export interface NapRecord {
  date: string;
  duration_min: number;
  sleep_start: string;
  sleep_end: string;
}

export interface SqliteParseResult {
  sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[];
  naps: NapRecord[];
  stats: { totalSleep: number; filteredCount: number; dateRange: string };
}

// Nuits < 2h filtrées (sieste / capteur non porté)
const MIN_SLEEP_MIN = 120;

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToDateStr(unix: number): string {
  const d = new Date(unix * 1000);
  // Utilise l'heure locale (et non UTC) pour éviter les décalages de date en soirée/nuit
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
 * États dans ce DB (8292589056) :
 * 2=REM, 3=léger, 4=profond, 5=éveillé
 * Ces valeurs correspondent directement au STAGE_CONFIG — pas de remapping nécessaire.
 */

// ── sql.js CDN loader ─────────────────────────────────────────────────────────

const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0';

type SqlJsDb = {
  exec: (sql: string) => Array<{ values: unknown[][] }>;
  close: () => void;
};

type SqlJsStatic = {
  Database: new (data: Uint8Array) => SqlJsDb;
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
      script.onerror = () => reject(new Error(
        'Impossible de charger le moteur SQLite. Vérifie ta connexion internet et réessaie.'
      ));
      // Timeout de 15 s — les réseaux mobiles peuvent être lents
      const timer = setTimeout(() => {
        reject(new Error('Délai dépassé lors du chargement du moteur SQLite. Réessaie sur un réseau plus rapide.'));
      }, 15_000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      document.head.appendChild(script);
    });
  }
  return window.initSqlJs!({ locateFile: (f: string) => `${SQL_JS_CDN}/${f}` });
}

// ── WAL merger ────────────────────────────────────────────────────────────────

/**
 * Applique les pages du fichier WAL sur le buffer principal du .db.
 * Format WAL SQLite : header 32 octets + frames (24 octets header + pageSize octets données).
 * Seules les frames dont le salt correspond au header WAL sont considérées valides.
 */
function applyWalToDb(dbBytes: Uint8Array<ArrayBuffer>, walBytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (walBytes.length < 32) return dbBytes;

  const w = new DataView(walBytes.buffer, walBytes.byteOffset);
  const magic = w.getUint32(0, false);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) return dbBytes;

  const pageSize   = w.getUint32(8, false);
  if (pageSize < 512 || pageSize > 65536) return dbBytes;

  const salt1      = w.getUint32(16, false);
  const salt2      = w.getUint32(20, false);
  const frameSize  = 24 + pageSize;
  const frameCount = Math.floor((walBytes.length - 32) / frameSize);
  if (frameCount === 0) return dbBytes;

  // Dernière version de chaque page (on itère en ordre → la dernière écriture gagne)
  const pageMap = new Map<number, Uint8Array>();
  for (let i = 0; i < frameCount; i++) {
    const off  = 32 + i * frameSize;
    const fv   = new DataView(walBytes.buffer, walBytes.byteOffset + off);
    if (fv.getUint32(8, false) !== salt1 || fv.getUint32(12, false) !== salt2) continue;
    const pageNo = fv.getUint32(0, false);
    if (pageNo < 1) continue;
    pageMap.set(pageNo, walBytes.slice(off + 24, off + 24 + pageSize));
  }

  if (pageMap.size === 0) return dbBytes;

  let maxPage = 0;
  for (const k of Array.from(pageMap.keys())) if (k > maxPage) maxPage = k;
  const result   = new Uint8Array(Math.max(dbBytes.length, maxPage * pageSize));
  result.set(dbBytes);
  pageMap.forEach((data, pageNo) => {
    result.set(data, (pageNo - 1) * pageSize);
  });
  return result;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Parse un fichier .db Mi Fitness directement (pas de ZIP).
 * Si walFile est fourni, fusionne le WAL dans le buffer .db avant parsing
 * pour inclure les données récentes non encore checkpointées.
 */
export async function parseMiFitnessDb(
  file: File,
  onProgress: (pct: number) => void,
  walFile?: File,
  shmFile?: File,
): Promise<SqliteParseResult> {
  onProgress(5);

  const [buffer, walBuffer] = await Promise.all([
    file.arrayBuffer(),
    walFile?.arrayBuffer(),
  ]);
  onProgress(20);

  const SQL = await loadSqlJsFromCDN();
  onProgress(40);
  onProgress(55);

  let dbData = new Uint8Array(buffer as ArrayBuffer);
  if (walBuffer) {
    dbData = applyWalToDb(dbData, new Uint8Array(walBuffer as ArrayBuffer));
  }
  const db = new SQL.Database(dbData);

  // Pas quotidiens — `time` est une colonne (UTC midnight), `steps` est dans le JSON
  const stepsByDate = new Map<string, number>();
  try {
    const res = db.exec("SELECT time, value FROM steps_day WHERE deleted = 0 ORDER BY rowid");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const t = row[0] as number;
        const d = JSON.parse(row[1] as string) as { steps?: number };
        // `time` est un timestamp UTC en secondes → date UTC (cohérent avec sleep_day)
        const date = new Date(t * 1000).toISOString().split('T')[0];
        if (d.steps != null) stepsByDate.set(date, d.steps);
      }
    }
  } catch { /* table absente = pas grave */ }

  // Scores officiels Mi Fitness depuis sleep_day (meilleurs que notre calcul)
  const scoreByDate = new Map<string, number>();
  try {
    const res = db.exec("SELECT time, value FROM sleep_day WHERE deleted = 0 ORDER BY rowid");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const t = row[0] as number;
        const d = JSON.parse(row[1] as string) as { sleep_score?: number };
        const date = new Date(t * 1000).toISOString().split('T')[0];
        if (d.sleep_score != null) scoreByDate.set(date, d.sleep_score);
      }
    }
  } catch { /* table absente = pas grave */ }

  onProgress(65);

  // Nuits de sommeil
  const sleepRes = db.exec('SELECT value FROM sleep WHERE deleted = 0 ORDER BY rowid');
  const sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[] = [];
  const naps: NapRecord[] = [];
  let filteredCount = 0;

  if (sleepRes.length > 0) {
    const rows = sleepRes[0].values;
    rows.forEach((row, i) => {
      try {
        const raw: MiSleepRaw = JSON.parse(row[0] as string);
        if (!raw.bedtime || !raw.wake_up_time || !raw.duration) return;

        // Nuits trop courtes → sieste si coucher entre 12h et 21h, sinon fragment silencieux
        if (raw.duration < MIN_SLEEP_MIN) {
          filteredCount++;
          const bedHour = new Date(raw.bedtime * 1000).getHours();
          if (bedHour >= 12 && bedHour < 21) {
            naps.push({
              date:         unixToDateStr(raw.wake_up_time),
              duration_min: raw.duration,
              sleep_start:  unixToTimeStr(raw.bedtime),
              sleep_end:    unixToTimeStr(raw.wake_up_time),
            });
          }
          return;
        }

        const deep  = raw.sleep_deep_duration  ?? 0;
        const light = raw.sleep_light_duration ?? 0;
        const rem   = raw.sleep_rem_duration   ?? 0;
        // `sleep_awake_duration` est directement dans le JSON (plus fiable que duration - phases)
        const awake = raw.sleep_awake_duration ?? Math.max(0, raw.duration - deep - light - rem);

        // Mi Fitness date une nuit par le jour du réveil (wake_up_time), pas le coucher
        const date    = unixToDateStr(raw.wake_up_time);
        // Date en UTC pour faire correspondre les clés sleep_day et steps_day (stockés en UTC)
        const dateUtc = new Date(raw.wake_up_time * 1000).toISOString().split('T')[0];

        sleepRecords.push({
          date,
          sleep_start:       unixToTimeStr(raw.bedtime),
          sleep_end:         unixToTimeStr(raw.wake_up_time),
          duration_min:      raw.duration,
          deep_sleep_min:    deep,
          light_sleep_min:   light,
          rem_sleep_min:     rem,
          awake_min:         awake,
          // Score officiel Mi Fitness en priorité, sinon notre calcul de fallback
          sleep_score:       scoreByDate.get(dateUtc) ?? calcSleepScore(raw.duration, deep, rem),
          hr_avg:            raw.avg_hr ?? 0,
          hr_min:            raw.min_hr ?? 0,
          hr_max:            raw.max_hr ?? 0,
          steps:             stepsByDate.get(dateUtc) ?? 0,
          sleep_stages_json: raw.items?.length
            ? JSON.stringify(raw.items)
            : undefined,
        });
      } catch { /* ligne corrompue, skip */ }
      if (i % 20 === 0) onProgress(65 + Math.floor((i / rows.length) * 30));
    });
  }

  db.close();
  onProgress(100);

  // Dédoublonner par date : même date = sieste + vraie nuit → garder la plus longue
  const byDate = new Map<string, Omit<SleepRecord, 'id' | 'imported_at'>>();
  for (const r of sleepRecords) {
    const existing = byDate.get(r.date);
    if (!existing || r.duration_min > existing.duration_min) {
      byDate.set(r.date, r);
    }
  }
  const deduped = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const dates = deduped.map(r => r.date);
  return {
    sleepRecords: deduped,
    naps,
    stats: {
      totalSleep:    deduped.length,
      filteredCount,
      dateRange:     dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : 'aucune',
    },
  };
}
