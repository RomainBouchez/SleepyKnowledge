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

// Lazy singleton — only instantiated in the browser (never during SSR)
let _db: SleepIQDb | null = null;
function getDb(): SleepIQDb {
  if (!_db) _db = new SleepIQDb();
  return _db;
}

// ── Sleep records ─────────────────────────────────────────────────────────────

export async function upsertSleepRecord(record: Omit<SleepRecord, 'id'>): Promise<void> {
  const existing = await getDb().sleepRecords.where('date').equals(record.date).first();
  if (existing?.id != null) {
    await getDb().sleepRecords.update(existing.id, record);
  } else {
    await getDb().sleepRecords.add(record as SleepRecord);
  }
}

export async function getSleepRecords(days = 30): Promise<SleepRecord[]> {
  const all = await getDb().sleepRecords.orderBy('date').reverse().limit(days).toArray();
  return all.reverse(); // oldest first for charting
}

export async function getLatestSleepRecord(): Promise<SleepRecord | null> {
  const rec = await getDb().sleepRecords.orderBy('date').last();
  return rec ?? null;
}

export async function getTodaySleepRecord(): Promise<SleepRecord | null> {
  const rec = await getDb().sleepRecords.where('date').equals(todayStr()).first();
  return rec ?? null;
}

// ── Lifestyle logs ────────────────────────────────────────────────────────────

export async function upsertLifestyleLog(log: Omit<LifestyleLog, 'id'>): Promise<void> {
  const existing = await getDb().lifestyleLogs.where('date').equals(log.date).first();
  if (existing?.id != null) {
    await getDb().lifestyleLogs.update(existing.id, log);
  } else {
    await getDb().lifestyleLogs.add(log as LifestyleLog);
  }
}

export async function getTodayLifestyleLog(): Promise<LifestyleLog | null> {
  const log = await getDb().lifestyleLogs.where('date').equals(todayStr()).first();
  return log ?? null;
}

export async function getLifestyleLogs(days = 30): Promise<LifestyleLog[]> {
  const all = await getDb().lifestyleLogs.orderBy('date').reverse().limit(days).toArray();
  return all.reverse();
}

// ── AI insights ───────────────────────────────────────────────────────────────

export async function saveAiInsight(insight: Omit<AiInsight, 'id'>): Promise<void> {
  const existing = await getDb().aiInsights
    .where('[date+type]')
    .equals([insight.date, insight.type])
    .first();
  if (existing?.id != null) {
    await getDb().aiInsights.update(existing.id, insight);
  } else {
    await getDb().aiInsights.add(insight as AiInsight);
  }
}

export async function getAiInsight(date: string, type: AiInsight['type']): Promise<AiInsight | null> {
  const insight = await getDb().aiInsights
    .where('[date+type]')
    .equals([date, type])
    .first();
  return insight ?? null;
}

export async function getLatestWeeklyReports(limit = 4): Promise<AiInsight[]> {
  return getDb().aiInsights
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
