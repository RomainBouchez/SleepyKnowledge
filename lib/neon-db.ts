/**
 * Server-side Neon queries — never import this in client components.
 */
import { neon } from '@neondatabase/serverless';
import type { SleepRecord, LifestyleLog, AiInsight } from './types';

const sql = neon(process.env.DATABASE_URL!);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Postgres DATE → "YYYY-MM-DD"
 *  Neon serverless returns DATE columns as JS Date objects whose .toString()
 *  yields "Mon Nov 01 2026 …" — we must use toISOString() instead.
 */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return '';
}

/** Postgres TIMESTAMPTZ → ISO 8601 string */
function toTimestamp(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? '');
}

/** Postgres TIME → "HH:MM" */
function toHHMM(t: unknown): string {
  if (!t || typeof t !== 'string') return '';
  return t.slice(0, 5);
}

function toFloat(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseFloat(v as string) || 0;
}

function toInt(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseInt(v as string, 10) || 0;
}

// ── Sleep records ─────────────────────────────────────────────────────────────

export async function neonUpsertSleepRecord(
  deviceId: string,
  r: Omit<SleepRecord, 'id'>
): Promise<void> {
  await sql`
    INSERT INTO sleep_records
      (device_id, date, sleep_start, sleep_end, duration_min, deep_sleep_min,
       light_sleep_min, rem_sleep_min, awake_min, sleep_score,
       hr_avg, hr_min, hr_max, steps, imported_at, sleep_stages_json)
    VALUES
      (${deviceId}, ${r.date}, ${r.sleep_start}, ${r.sleep_end},
       ${r.duration_min}, ${r.deep_sleep_min}, ${r.light_sleep_min},
       ${r.rem_sleep_min}, ${r.awake_min}, ${r.sleep_score},
       ${r.hr_avg}, ${r.hr_min}, ${r.hr_max}, ${r.steps},
       ${r.imported_at}, ${r.sleep_stages_json ?? null})
    ON CONFLICT (device_id, date) DO UPDATE SET
      sleep_start      = EXCLUDED.sleep_start,
      sleep_end        = EXCLUDED.sleep_end,
      duration_min     = EXCLUDED.duration_min,
      deep_sleep_min   = EXCLUDED.deep_sleep_min,
      light_sleep_min  = EXCLUDED.light_sleep_min,
      rem_sleep_min    = EXCLUDED.rem_sleep_min,
      awake_min        = EXCLUDED.awake_min,
      sleep_score      = EXCLUDED.sleep_score,
      hr_avg           = EXCLUDED.hr_avg,
      hr_min           = EXCLUDED.hr_min,
      hr_max           = EXCLUDED.hr_max,
      steps            = EXCLUDED.steps,
      imported_at      = EXCLUDED.imported_at,
      sleep_stages_json = EXCLUDED.sleep_stages_json
  `;
}

export async function neonGetSleepRecords(
  deviceId: string,
  days = 90
): Promise<Omit<SleepRecord, 'id'>[]> {
  const rows = await sql`
    SELECT * FROM sleep_records
    WHERE device_id = ${deviceId}
    ORDER BY date DESC
    LIMIT ${days}
  `;
  return rows.map((r) => ({
    date:             toDateStr(r.date),
    sleep_start:      toHHMM(r.sleep_start),
    sleep_end:        toHHMM(r.sleep_end),
    duration_min:     toInt(r.duration_min),
    deep_sleep_min:   toInt(r.deep_sleep_min),
    light_sleep_min:  toInt(r.light_sleep_min),
    rem_sleep_min:    toInt(r.rem_sleep_min),
    awake_min:        toInt(r.awake_min),
    sleep_score:      toInt(r.sleep_score),
    hr_avg:           toFloat(r.hr_avg),
    hr_min:           toFloat(r.hr_min),
    hr_max:           toFloat(r.hr_max),
    steps:            toInt(r.steps),
    imported_at:      toTimestamp(r.imported_at),
    sleep_stages_json: r.sleep_stages_json ? String(r.sleep_stages_json) : undefined,
  }));
}

// ── Lifestyle logs ────────────────────────────────────────────────────────────

export async function neonUpsertLifestyleLog(
  deviceId: string,
  l: Omit<LifestyleLog, 'id'>
): Promise<void> {
  await sql`
    INSERT INTO lifestyle_logs
      (device_id, date, caffeine_mg, caffeine_last_hour, sport_type,
       sport_intensity, sport_hour, screen_last_hour, meal_hour,
       meal_heaviness, weed, weed_hour, notes)
    VALUES
      (${deviceId}, ${l.date}, ${l.caffeine_mg}, ${l.caffeine_last_hour || null},
       ${l.sport_type}, ${l.sport_intensity}, ${l.sport_hour || null},
       ${l.screen_last_hour || null}, ${l.meal_hour || null},
       ${l.meal_heaviness}, ${l.weed}, ${l.weed_hour || null}, ${l.notes})
    ON CONFLICT (device_id, date) DO UPDATE SET
      caffeine_mg       = EXCLUDED.caffeine_mg,
      caffeine_last_hour = EXCLUDED.caffeine_last_hour,
      sport_type        = EXCLUDED.sport_type,
      sport_intensity   = EXCLUDED.sport_intensity,
      sport_hour        = EXCLUDED.sport_hour,
      screen_last_hour  = EXCLUDED.screen_last_hour,
      meal_hour         = EXCLUDED.meal_hour,
      meal_heaviness    = EXCLUDED.meal_heaviness,
      weed              = EXCLUDED.weed,
      weed_hour         = EXCLUDED.weed_hour,
      notes             = EXCLUDED.notes
  `;
}

export async function neonGetLifestyleLogs(
  deviceId: string,
  days = 90
): Promise<Omit<LifestyleLog, 'id'>[]> {
  const rows = await sql`
    SELECT * FROM lifestyle_logs
    WHERE device_id = ${deviceId}
    ORDER BY date DESC
    LIMIT ${days}
  `;
  return rows.map((r) => ({
    date:               toDateStr(r.date),
    caffeine_mg:        toInt(r.caffeine_mg),
    caffeine_last_hour: toHHMM(r.caffeine_last_hour),
    sport_type:         String(r.sport_type ?? ''),
    sport_intensity:    toInt(r.sport_intensity),
    sport_hour:         toHHMM(r.sport_hour),
    screen_last_hour:   toHHMM(r.screen_last_hour),
    meal_hour:          toHHMM(r.meal_hour),
    meal_heaviness:     (r.meal_heaviness as 'léger' | 'normal' | 'lourd') ?? 'normal',
    weed:               Boolean(r.weed),
    weed_hour:          toHHMM(r.weed_hour),
    notes:              String(r.notes ?? ''),
  }));
}

// ── AI insights ───────────────────────────────────────────────────────────────

export async function neonUpsertAiInsight(
  deviceId: string,
  i: Omit<AiInsight, 'id'>
): Promise<void> {
  await sql`
    INSERT INTO ai_insights (device_id, date, type, content, generated_at)
    VALUES (${deviceId}, ${i.date}, ${i.type}, ${i.content}, ${i.generated_at})
    ON CONFLICT (device_id, date, type) DO UPDATE SET
      content      = EXCLUDED.content,
      generated_at = EXCLUDED.generated_at
  `;
}

export async function neonGetAiInsights(
  deviceId: string,
  limit = 30
): Promise<Omit<AiInsight, 'id'>[]> {
  const rows = await sql`
    SELECT * FROM ai_insights
    WHERE device_id = ${deviceId}
    ORDER BY date DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    date:         toDateStr(r.date),
    type:         r.type as AiInsight['type'],
    content:      String(r.content),
    generated_at: toTimestamp(r.generated_at),
  }));
}
