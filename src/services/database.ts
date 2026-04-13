import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';
import {SleepRecord, LifestyleLog, AiInsight} from '../types';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

let db: SQLiteDatabase | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabase({name: 'sleepiq.db', location: 'default'});
  await db.executeSql(`PRAGMA journal_mode = WAL;`);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS sleep_records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT UNIQUE NOT NULL,
      sleep_start  TEXT,
      sleep_end    TEXT,
      duration_min INTEGER,
      deep_sleep_min INTEGER,
      light_sleep_min INTEGER,
      rem_sleep_min  INTEGER,
      awake_min    INTEGER,
      sleep_score  INTEGER,
      hr_avg       INTEGER,
      hr_min       INTEGER,
      hr_max       INTEGER,
      steps        INTEGER,
      imported_at  TEXT
    );
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS lifestyle_logs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      date              TEXT UNIQUE NOT NULL,
      caffeine_mg       INTEGER DEFAULT 0,
      caffeine_last_hour TEXT DEFAULT '',
      sport_type        TEXT DEFAULT '',
      sport_intensity   INTEGER DEFAULT 0,
      sport_hour        TEXT DEFAULT '',
      screen_last_hour  TEXT DEFAULT '',
      meal_hour         TEXT DEFAULT '',
      meal_heaviness    TEXT DEFAULT 'normal',
      weed              INTEGER DEFAULT 0,
      weed_hour         TEXT DEFAULT '',
      notes             TEXT DEFAULT ''
    );
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT NOT NULL,
      type         TEXT NOT NULL,
      content      TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      UNIQUE(date, type)
    );
  `);
}

function getDb(): SQLiteDatabase {
  if (!db) {throw new Error('Database not initialised — call initDatabase() first');}
  return db;
}

// ── Sleep records ─────────────────────────────────────────────────────────────

export async function upsertSleepRecord(record: Omit<SleepRecord, 'id'>): Promise<void> {
  const d = getDb();
  await d.executeSql(
    `INSERT OR REPLACE INTO sleep_records
      (date, sleep_start, sleep_end, duration_min, deep_sleep_min, light_sleep_min,
       rem_sleep_min, awake_min, sleep_score, hr_avg, hr_min, hr_max, steps, imported_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      record.date, record.sleep_start, record.sleep_end,
      record.duration_min, record.deep_sleep_min, record.light_sleep_min,
      record.rem_sleep_min, record.awake_min, record.sleep_score,
      record.hr_avg, record.hr_min, record.hr_max,
      record.steps, record.imported_at,
    ],
  );
}

export async function getSleepRecords(days: number = 30): Promise<SleepRecord[]> {
  const [results] = await getDb().executeSql(
    `SELECT * FROM sleep_records ORDER BY date DESC LIMIT ?`,
    [days],
  );
  const rows: SleepRecord[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    rows.push(results.rows.item(i));
  }
  return rows.reverse(); // oldest first for charting
}

export async function getTodaySleepRecord(): Promise<SleepRecord | null> {
  const today = todayStr();
  const [results] = await getDb().executeSql(
    `SELECT * FROM sleep_records WHERE date = ? LIMIT 1`,
    [today],
  );
  return results.rows.length > 0 ? results.rows.item(0) : null;
}

export async function getLatestSleepRecord(): Promise<SleepRecord | null> {
  const [results] = await getDb().executeSql(
    `SELECT * FROM sleep_records ORDER BY date DESC LIMIT 1`,
  );
  return results.rows.length > 0 ? results.rows.item(0) : null;
}

// ── Lifestyle logs ────────────────────────────────────────────────────────────

export async function upsertLifestyleLog(log: Omit<LifestyleLog, 'id'>): Promise<void> {
  const d = getDb();
  await d.executeSql(
    `INSERT OR REPLACE INTO lifestyle_logs
      (date, caffeine_mg, caffeine_last_hour, sport_type, sport_intensity,
       sport_hour, screen_last_hour, meal_hour, meal_heaviness, weed, weed_hour, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      log.date, log.caffeine_mg, log.caffeine_last_hour,
      log.sport_type, log.sport_intensity, log.sport_hour,
      log.screen_last_hour, log.meal_hour, log.meal_heaviness,
      log.weed ? 1 : 0, log.weed_hour, log.notes,
    ],
  );
}

export async function getTodayLifestyleLog(): Promise<LifestyleLog | null> {
  const today = todayStr();
  const [results] = await getDb().executeSql(
    `SELECT * FROM lifestyle_logs WHERE date = ? LIMIT 1`,
    [today],
  );
  if (results.rows.length === 0) {return null;}
  const row = results.rows.item(0);
  return {...row, weed: row.weed === 1};
}

export async function getLifestyleLogs(days: number = 30): Promise<LifestyleLog[]> {
  const [results] = await getDb().executeSql(
    `SELECT * FROM lifestyle_logs ORDER BY date DESC LIMIT ?`,
    [days],
  );
  const rows: LifestyleLog[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    rows.push({...row, weed: row.weed === 1});
  }
  return rows.reverse();
}

// ── AI insights ───────────────────────────────────────────────────────────────

export async function saveAiInsight(insight: Omit<AiInsight, 'id'>): Promise<void> {
  await getDb().executeSql(
    `INSERT OR REPLACE INTO ai_insights (date, type, content, generated_at)
     VALUES (?,?,?,?)`,
    [insight.date, insight.type, insight.content, insight.generated_at],
  );
}

export async function getAiInsight(date: string, type: AiInsight['type']): Promise<AiInsight | null> {
  const [results] = await getDb().executeSql(
    `SELECT * FROM ai_insights WHERE date = ? AND type = ? LIMIT 1`,
    [date, type],
  );
  return results.rows.length > 0 ? results.rows.item(0) : null;
}

export async function getLatestWeeklyReports(limit: number = 4): Promise<AiInsight[]> {
  const [results] = await getDb().executeSql(
    `SELECT * FROM ai_insights WHERE type = 'weekly_report' ORDER BY date DESC LIMIT ?`,
    [limit],
  );
  const rows: AiInsight[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    rows.push(results.rows.item(i));
  }
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// ── Seed data (30 days of realistic test data) ────────────────────────────────

export async function seedTestData(): Promise<void> {
  // Only seed if no records exist
  const [check] = await getDb().executeSql(
    `SELECT COUNT(*) as count FROM sleep_records`,
  );
  if (check.rows.item(0).count > 0) {return;}

  const sportTypes = ['running', 'weights', 'cycling', 'yoga', 'none'];
  const mealOptions: Array<'léger' | 'normal' | 'lourd'> = ['léger', 'normal', 'lourd'];

  for (let i = 29; i >= 0; i--) {
    const date = dateOffset(i);

    // Realistic sleep patterns with occasional bad nights
    const badNight = Math.random() < 0.2;
    const durationMin = badNight
      ? 240 + Math.floor(Math.random() * 90)   // 4–5.5h
      : 360 + Math.floor(Math.random() * 120);  // 6–8h

    const deepPct = badNight ? 0.08 + Math.random() * 0.08 : 0.15 + Math.random() * 0.1;
    const remPct  = badNight ? 0.12 + Math.random() * 0.08 : 0.20 + Math.random() * 0.06;
    const deepMin = Math.floor(durationMin * deepPct);
    const remMin  = Math.floor(durationMin * remPct);
    const lightMin= Math.floor(durationMin * 0.55);
    const awakeMin= Math.max(0, durationMin - deepMin - remMin - lightMin);

    const sleepScore = Math.min(100, Math.floor(
      (deepPct * 200) + (remPct * 120) + (durationMin / 480 * 40),
    ));

    const bedHour = 21 + Math.floor(Math.random() * 2);
    const bedMin  = Math.floor(Math.random() * 60);
    const wakeHour= 6 + Math.floor(Math.random() * 2);
    const wakeMin = Math.floor(Math.random() * 60);

    await upsertSleepRecord({
      date,
      sleep_start: `${String(bedHour).padStart(2, '0')}:${String(bedMin).padStart(2, '0')}`,
      sleep_end:   `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`,
      duration_min: durationMin,
      deep_sleep_min: deepMin,
      light_sleep_min: lightMin,
      rem_sleep_min: remMin,
      awake_min: awakeMin,
      sleep_score: sleepScore,
      hr_avg: 52 + Math.floor(Math.random() * 10),
      hr_min: 44 + Math.floor(Math.random() * 8),
      hr_max: 72 + Math.floor(Math.random() * 18),
      steps: 4000 + Math.floor(Math.random() * 10000),
      imported_at: new Date().toISOString(),
    });

    const caffeineHour = 8 + Math.floor(Math.random() * 10); // 08:00–18:00
    const sportDayChance = Math.random() > 0.45;
    const weedNight = Math.random() > 0.75;

    await upsertLifestyleLog({
      date,
      caffeine_mg: 80 + Math.floor(Math.random() * 320),
      caffeine_last_hour: `${String(caffeineHour).padStart(2, '0')}:00`,
      sport_type: sportDayChance
        ? sportTypes[Math.floor(Math.random() * (sportTypes.length - 1))]
        : 'none',
      sport_intensity: sportDayChance ? 1 + Math.floor(Math.random() * 9) : 0,
      sport_hour: sportDayChance
        ? `${String(16 + Math.floor(Math.random() * 4)).padStart(2, '0')}:00`
        : '',
      screen_last_hour: `${String(20 + Math.floor(Math.random() * 3)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      meal_hour: `${String(19 + Math.floor(Math.random() * 2)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      meal_heaviness: mealOptions[Math.floor(Math.random() * 3)],
      weed: weedNight,
      weed_hour: weedNight
        ? `${String(20 + Math.floor(Math.random() * 2)).padStart(2, '0')}:00`
        : '',
      notes: '',
    });
  }
}
