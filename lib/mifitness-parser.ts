/**
 * Parser for Mi Fitness ZIP export data.
 * Reads CSVs from the ZIP and maps them to SleepRecord / SportRecord shapes.
 */
import type { SleepRecord, SleepStageItem } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToDateStr(unix: number): string {
  return new Date(unix * 1000).toISOString().split('T')[0];
}

function unixToTimeStr(unix: number): string {
  const d = new Date(unix * 1000);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Minimal CSV parser that handles quoted fields containing commas and JSON.
 * Returns array of row objects keyed by header names.
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (insideQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (ch === ',' && !insideQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Sleep parser ──────────────────────────────────────────────────────────────

interface AggregatedRow {
  Uid: string; Sid: string; Tag: string; Key: string;
  Time: string; Value: string; UpdateTime: string;
}

interface ParseResult {
  sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[];
  sportRecords: SportRecord[];
  stats: { totalSleep: number; totalSport: number; dateRange: string };
}

export interface SportRecord {
  date: string;          // YYYY-MM-DD
  sport_type: string;    // outdoor_walking, strength_training, indoor_running …
  duration_min: number;
  calories: number;
  avg_hr: number;
  max_hr: number;
  steps: number;
  distance_m: number;
}

/**
 * Main entry point.
 * Takes the text contents of the CSV files and returns structured data.
 */
export function parseMiFitnessZip(files: Map<string, string>): ParseResult {
  const sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[] = [];
  const sportRecords: SportRecord[] = [];

  // Find the relevant files (match by suffix pattern, ignore uid prefix)
  const aggregatedText = findFile(files, 'hlth_center_aggregated_fitness_data.csv');
  const sportText      = findFile(files, 'hlth_center_sport_record.csv');
  const fitnessText    = findFile(files, 'hlth_center_fitness_data.csv');

  // ── Parse sleep from aggregated daily report ──────────────────────────────
  if (aggregatedText) {
    const rows = parseCSV(aggregatedText) as unknown as AggregatedRow[];

    // Index steps by date for joining
    const stepsByDate = new Map<string, number>();
    for (const row of rows) {
      if (row.Tag === 'daily_report' && row.Key === 'steps') {
        try {
          const v = JSON.parse(row.Value);
          const date = unixToDateStr(Number(row.Time));
          stepsByDate.set(date, v.steps ?? 0);
        } catch { /* skip */ }
      }
    }

    for (const row of rows) {
      if (row.Tag !== 'daily_report' || row.Key !== 'sleep') continue;
      try {
        const v = JSON.parse(row.Value);
        // Date comes from the Time column (day anchor, midnight UTC)
        const date = unixToDateStr(Number(row.Time));

        // bedtime / wake_up_time live in segment_details[0]
        const seg = Array.isArray(v.segment_details) ? v.segment_details[0] : null;
        const bedtime    = seg?.bedtime    ?? v.bedtime    ?? 0;
        const wakeUpTime = seg?.wake_up_time ?? v.wake_up_time ?? 0;

        sleepRecords.push({
          date,
          sleep_start:    bedtime    ? unixToTimeStr(bedtime)    : '00:00',
          sleep_end:      wakeUpTime ? unixToTimeStr(wakeUpTime) : '00:00',
          duration_min:   v.total_duration        ?? 0,
          deep_sleep_min: v.sleep_deep_duration   ?? 0,
          light_sleep_min:v.sleep_light_duration  ?? 0,
          rem_sleep_min:  v.sleep_rem_duration    ?? 0,
          awake_min:      v.sleep_awake_duration  ?? 0,
          sleep_score:    v.sleep_score           ?? 0,
          hr_avg:         v.avg_hr                ?? 0,
          hr_min:         v.min_hr                ?? 0,
          hr_max:         v.max_hr                ?? 0,
          steps:          stepsByDate.get(date)   ?? 0,
          // sleep_stages_json will be joined later from fitness data
        });
      } catch { /* skip malformed row */ }
    }
  }

  // ── Join detailed sleep stages from fitness data ──────────────────────────
  // The fitness CSV is 24MB with 145k rows — we only scan for ",sleep," lines
  // to avoid parsing irrelevant heart_rate/calories/etc. rows.
  if (fitnessText) {
    const stagesByDate = parseFitnessSleepStages(fitnessText);
    for (const record of sleepRecords) {
      const stages = stagesByDate.get(record.date);
      if (stages) {
        (record as SleepRecord).sleep_stages_json = JSON.stringify(stages);
      }
    }
  }

  // ── Parse sport sessions ──────────────────────────────────────────────────
  if (sportText) {
    const rows = parseCSV(sportText);
    for (const row of rows) {
      try {
        const v = JSON.parse(row.Value ?? '{}');
        sportRecords.push({
          date:         unixToDateStr(Number(row.Time ?? v.start_time ?? 0)),
          sport_type:   row.Key ?? v.sport_type ?? 'unknown',
          duration_min: Math.round((v.duration ?? 0) / 60),
          calories:     v.calories  ?? 0,
          avg_hr:       v.avg_hrm   ?? v.avg_hr  ?? 0,
          max_hr:       v.max_hrm   ?? v.max_hr  ?? 0,
          steps:        v.steps     ?? 0,
          distance_m:   v.distance  ?? 0,
        });
      } catch { /* skip */ }
    }
  }

  // ── Date range for summary ────────────────────────────────────────────────
  const dates = sleepRecords.map(r => r.date).sort();
  const dateRange = dates.length
    ? `${dates[0]} → ${dates[dates.length - 1]}`
    : 'aucune';

  return {
    sleepRecords,
    sportRecords,
    stats: {
      totalSleep: sleepRecords.length,
      totalSport: sportRecords.length,
      dateRange,
    },
  };
}

function findFile(files: Map<string, string>, suffix: string): string | undefined {
  const entries = Array.from(files.entries());
  for (const [name, content] of entries) {
    if (name.endsWith(suffix)) return content;
  }
  return undefined;
}

/**
 * Efficiently extract sleep stage items from the large fitness CSV.
 * Only parses lines that contain ",sleep," — skips all heart_rate/calories/etc.
 * Returns a map of date → SleepStageItem[]
 */
function parseFitnessSleepStages(text: string): Map<string, SleepStageItem[]> {
  const result = new Map<string, SleepStageItem[]>();
  const lines = text.split('\n');

  for (const line of lines) {
    // Fast pre-filter — only process sleep rows
    if (!line.includes(',sleep,')) continue;

    try {
      const cols = splitCSVLine(line);
      // columns: Uid, Sid, Key, Time, Value, UpdateTime
      if (cols[2] !== 'sleep') continue;

      const value = JSON.parse(cols[4]);
      const items: SleepStageItem[] = (value.items ?? []).map((item: SleepStageItem) => ({
        start_time: item.start_time,
        end_time:   item.end_time,
        state:      item.state,
      }));

      if (items.length === 0) continue;

      // Derive date from wake_up_time (= the Time column)
      const wakeUpUnix = Number(cols[3]);
      const date = unixToDateStr(wakeUpUnix);

      // Keep the record with the most items if there are duplicates for the same date
      const existing = result.get(date);
      if (!existing || items.length > existing.length) {
        result.set(date, items);
      }
    } catch { /* skip malformed */ }
  }

  return result;
}
