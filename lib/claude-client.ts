/**
 * Client-side Claude helpers.
 * Actual API calls go through Next.js API routes (server-side) to keep
 * the API key out of the browser bundle.
 */
import type { SleepRecord, LifestyleLog, ChatMessage } from './types';

// ── Context builder ───────────────────────────────────────────────────────────

export function buildSleepContext(
  sleepRecords: SleepRecord[],
  lifestyleLogs: LifestyleLog[],
): string {
  const logMap = new Map(lifestyleLogs.map(l => [l.date, l]));

  const rows = sleepRecords.map(s => {
    const l = logMap.get(s.date);
    const deepPct = s.duration_min > 0 ? Math.round((s.deep_sleep_min / s.duration_min) * 100) : 0;
    const remPct  = s.duration_min > 0 ? Math.round((s.rem_sleep_min  / s.duration_min) * 100) : 0;
    const durH    = (s.duration_min / 60).toFixed(1);

    let row = `${s.date}: durée=${durH}h, score=${s.sleep_score}/100, deep=${deepPct}%, REM=${remPct}%, FC_moy=${s.hr_avg}bpm, coucher=${s.sleep_start}, lever=${s.sleep_end}, pas=${s.steps}`;
    if (l) {
      row += ` | caféine=${l.caffeine_mg}mg@${l.caffeine_last_hour}, sport=${l.sport_type}(${l.sport_intensity}/10)@${l.sport_hour}, écran_off=${l.screen_last_hour}, repas=${l.meal_heaviness}@${l.meal_hour}, weed=${l.weed ? 'oui@' + l.weed_hour : 'non'}`;
    }
    return row;
  });

  return `=== HISTORIQUE SOMMEIL & LIFESTYLE (${rows.length} jours) ===\n${rows.join('\n')}`;
}

// ── API callers (proxied through Next.js routes) ──────────────────────────────

export async function fetchMorningScore(
  sleep: SleepRecord,
  lifestyle: LifestyleLog | null,
): Promise<string> {
  const res = await fetch('/api/claude/morning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sleep, lifestyle }),
  });
  if (!res.ok) throw new Error(`Morning score API error: ${res.status}`);
  const data = await res.json() as { content: string };
  return data.content;
}

export async function streamChatResponse(
  messages: ChatMessage[],
  context: string,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch('/api/claude/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat API error: ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onDone();
}

export async function fetchWeeklyReport(
  sleepRecords: SleepRecord[],
  lifestyleLogs: LifestyleLog[],
): Promise<string> {
  const res = await fetch('/api/claude/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sleepRecords, lifestyleLogs }),
  });
  if (!res.ok) throw new Error(`Report API error: ${res.status}`);
  const data = await res.json() as { content: string };
  return data.content;
}

// ── Score colour helper (reused from theme) ───────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}
