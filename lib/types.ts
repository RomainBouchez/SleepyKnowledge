// ── Sleep data (imported from Mi Fitness CSV / VPS sync) ──────────────────────
export interface SleepStageItem {
  start_time: number;  // unix timestamp
  end_time: number;    // unix timestamp
  state: number;       // 2=REM, 3=light, 4=deep, 5=awake
}

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
  sleep_stages_json?: string; // JSON-encoded SleepStageItem[]
}

// ── Lifestyle factors (manual entry each evening) ─────────────────────────────
export type MealHeaviness = 'léger' | 'normal' | 'lourd';

export interface LifestyleLog {
  id?: number;
  date: string;
  caffeine_mg: number;
  caffeine_last_hour: string;
  sport_type: string;
  sport_intensity: number;    // 1–10
  sport_hour: string;
  screen_last_hour: string;
  meal_hour: string;
  meal_heaviness: MealHeaviness;
  weed: boolean;
  weed_hour: string;
  notes: string;
}

// ── AI-generated insights (cached in IndexedDB) ───────────────────────────────
export type InsightType = 'morning_score' | 'weekly_report';

export interface AiInsight {
  id?: number;
  date: string;
  type: InsightType;
  content: string;
  generated_at: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

// ── Sync payload from n8n/VPS ─────────────────────────────────────────────────
export interface SyncPayload {
  sleep: Omit<SleepRecord, 'id' | 'imported_at'>[];
  generatedAt: string;
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
export interface DataPoint {
  x: string | number;
  y: number;
}

export interface CorrelationPoint {
  x: number;
  y: number;
  date: string;
}
