/**
 * IndexedDB via Dexie — replaces react-native-sqlite-storage.
 * Same schema and function signatures as the original database.ts.
 */
import Dexie, { type Table } from 'dexie';
import type { SleepRecord, LifestyleLog, AiInsight } from './types';

// ── Database class ────────────────────────────────────────────────────────────

class SleepIQDb extends Dexie {
  sleepRecords!: Table<SleepRecord, number>;
  lifestyleLogs!: Table<LifestyleLog, number>;
  aiInsights!: Table<AiInsight, number>;

  constructor() {
    super('sleepiq');
    this.version(1).stores({
      sleepRecords: '++id, &date',
      lifestyleLogs: '++id, &date',
      aiInsights: '++id, [date+type]',
    });
  }
}

// Singleton — safe in browser (Dexie handles multiple opens)
export const db = new SleepIQDb();

// ── Sleep records ─────────────────────────────────────────────────────────────

export async function upsertSleepRecord(record: Omit<SleepRecord, 'id'>): Promise<void> {
  const existing = await db.sleepRecords.where('date').equals(record.date).first();
  if (existing?.id != null) {
    await db.sleepRecords.update(existing.id, record);
  } else {
    await db.sleepRecords.add(record as SleepRecord);
  }
}

export async function getSleepRecords(days = 30): Promise<SleepRecord[]> {
  const all = await db.sleepRecords.orderBy('date').reverse().limit(days).toArray();
  return all.reverse(); // oldest first for charting
}

export async function getLatestSleepRecord(): Promise<SleepRecord | null> {
  const rec = await db.sleepRecords.orderBy('date').last();
  return rec ?? null;
}

export async function getTodaySleepRecord(): Promise<SleepRecord | null> {
  const rec = await db.sleepRecords.where('date').equals(todayStr()).first();
  return rec ?? null;
}

// ── Lifestyle logs ────────────────────────────────────────────────────────────

export async function upsertLifestyleLog(log: Omit<LifestyleLog, 'id'>): Promise<void> {
  const existing = await db.lifestyleLogs.where('date').equals(log.date).first();
  if (existing?.id != null) {
    await db.lifestyleLogs.update(existing.id, log);
  } else {
    await db.lifestyleLogs.add(log as LifestyleLog);
  }
}

export async function getTodayLifestyleLog(): Promise<LifestyleLog | null> {
  const log = await db.lifestyleLogs.where('date').equals(todayStr()).first();
  return log ?? null;
}

export async function getLifestyleLogs(days = 30): Promise<LifestyleLog[]> {
  const all = await db.lifestyleLogs.orderBy('date').reverse().limit(days).toArray();
  return all.reverse();
}

// ── AI insights ───────────────────────────────────────────────────────────────

export async function saveAiInsight(insight: Omit<AiInsight, 'id'>): Promise<void> {
  const existing = await db.aiInsights
    .where('[date+type]')
    .equals([insight.date, insight.type])
    .first();
  if (existing?.id != null) {
    await db.aiInsights.update(existing.id, insight);
  } else {
    await db.aiInsights.add(insight as AiInsight);
  }
}

export async function getAiInsight(date: string, type: AiInsight['type']): Promise<AiInsight | null> {
  const insight = await db.aiInsights
    .where('[date+type]')
    .equals([date, type])
    .first();
  return insight ?? null;
}

export async function getLatestWeeklyReports(limit = 4): Promise<AiInsight[]> {
  return db.aiInsights
    .where('type')
    .equals('weekly_report')
    .reverse()
    .limit(limit)
    .toArray();
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
  const count = await db.sleepRecords.count();
  if (count > 0) return;

  const sportTypes = ['running', 'weights', 'cycling', 'yoga', 'none'];
  const mealOptions: Array<'léger' | 'normal' | 'lourd'> = ['léger', 'normal', 'lourd'];

  for (let i = 29; i >= 0; i--) {
    const date = dateOffset(i);
    const bad = Math.random() < 0.2;
    const dur = bad ? 240 + Math.floor(Math.random() * 90) : 360 + Math.floor(Math.random() * 120);

    const deepPct = bad ? 0.08 + Math.random() * 0.08 : 0.15 + Math.random() * 0.1;
    const remPct  = bad ? 0.12 + Math.random() * 0.08 : 0.20 + Math.random() * 0.06;
    const deep = Math.floor(dur * deepPct);
    const rem  = Math.floor(dur * remPct);
    const light= Math.floor(dur * 0.55);
    const awake= Math.max(0, dur - deep - rem - light);

    const score = Math.min(100, Math.floor((deepPct * 200) + (remPct * 120) + (dur / 480 * 40)));
    const bH = 21 + Math.floor(Math.random() * 2);
    const bM = Math.floor(Math.random() * 60);
    const wH = 6  + Math.floor(Math.random() * 2);
    const wM = Math.floor(Math.random() * 60);
    const pad = (n: number) => String(n).padStart(2, '0');

    await upsertSleepRecord({
      date,
      sleep_start: `${pad(bH)}:${pad(bM)}`,
      sleep_end:   `${pad(wH)}:${pad(wM)}`,
      duration_min: dur, deep_sleep_min: deep, light_sleep_min: light,
      rem_sleep_min: rem, awake_min: awake, sleep_score: score,
      hr_avg: 52 + Math.floor(Math.random() * 10),
      hr_min: 44 + Math.floor(Math.random() * 8),
      hr_max: 72 + Math.floor(Math.random() * 18),
      steps: 4000 + Math.floor(Math.random() * 10000),
      imported_at: new Date().toISOString(),
    });

    const sport = Math.random() > 0.45;
    const weed  = Math.random() > 0.75;
    const cafH  = 8 + Math.floor(Math.random() * 10);

    await upsertLifestyleLog({
      date,
      caffeine_mg: 80 + Math.floor(Math.random() * 320),
      caffeine_last_hour: `${pad(cafH)}:00`,
      sport_type: sport ? sportTypes[Math.floor(Math.random() * (sportTypes.length - 1))] : 'none',
      sport_intensity: sport ? 1 + Math.floor(Math.random() * 9) : 0,
      sport_hour: sport ? `${pad(16 + Math.floor(Math.random() * 4))}:00` : '',
      screen_last_hour: `${pad(20 + Math.floor(Math.random() * 3))}:${pad(Math.floor(Math.random() * 60))}`,
      meal_hour: `${pad(19 + Math.floor(Math.random() * 2))}:${pad(Math.floor(Math.random() * 60))}`,
      meal_heaviness: mealOptions[Math.floor(Math.random() * 3)],
      weed,
      weed_hour: weed ? `${pad(20 + Math.floor(Math.random() * 2))}:00` : '',
      notes: '',
    });
  }
}
