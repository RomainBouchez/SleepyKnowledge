// ── Sleep data (imported from Mi Fitness CSV) ─────────────────────────────────
export interface SleepRecord {
  id?: number;
  date: string;           // YYYY-MM-DD
  sleep_start: string;    // HH:MM
  sleep_end: string;      // HH:MM
  duration_min: number;
  deep_sleep_min: number;
  light_sleep_min: number;
  rem_sleep_min: number;
  awake_min: number;
  sleep_score: number;    // 0–100
  hr_avg: number;
  hr_min: number;
  hr_max: number;
  steps: number;
  imported_at: string;    // ISO timestamp
}

// ── Lifestyle factors (manual entry each evening) ─────────────────────────────
export type MealHeaviness = 'léger' | 'normal' | 'lourd';

export interface LifestyleLog {
  id?: number;
  date: string;             // YYYY-MM-DD
  caffeine_mg: number;
  caffeine_last_hour: string; // HH:MM
  sport_type: string;         // e.g. "running", "weights", "none"
  sport_intensity: number;    // 1–10
  sport_hour: string;         // HH:MM
  screen_last_hour: string;   // HH:MM
  meal_hour: string;          // HH:MM
  meal_heaviness: MealHeaviness;
  weed: boolean;
  weed_hour: string;          // HH:MM (empty string if weed=false)
  notes: string;
}

// ── AI-generated insights cached in SQLite ────────────────────────────────────
export type InsightType = 'morning_score' | 'weekly_report';

export interface AiInsight {
  id?: number;
  date: string;          // YYYY-MM-DD  (week start for reports)
  type: InsightType;
  content: string;
  generated_at: string;  // ISO timestamp
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;     // unix ms
}

// ── Sync payload from n8n/VPS ─────────────────────────────────────────────────
export interface SyncPayload {
  sleep: Omit<SleepRecord, 'id' | 'imported_at'>[];
  generatedAt: string;  // ISO timestamp from VPS
}

// ── Chart data point ──────────────────────────────────────────────────────────
export interface DataPoint {
  x: string | number;   // date label or index
  y: number;
}

// ── Correlation entry (lifestyle factor vs sleep metric) ─────────────────────
export interface CorrelationPoint {
  x: number;  // lifestyle value (e.g. caffeine_mg)
  y: number;  // sleep metric (e.g. deep_sleep_min)
  date: string;
}
