import Anthropic from '@anthropic-ai/sdk';
import Config from 'react-native-config';
import {SleepRecord, LifestyleLog, ChatMessage} from '../types';

const anthropic = new Anthropic({
  apiKey: Config.CLAUDE_API_KEY ?? '',
  dangerouslyAllowBrowser: true, // required for React Native / mobile env
});

// ── System prompts ────────────────────────────────────────────────────────────

const MORNING_SCORE_SYSTEM = `Tu es un coach sommeil expert et bienveillant. \
Analyse les données de sommeil de la nuit dernière et les facteurs lifestyle de la veille. \
Génère un commentaire court (2–3 phrases max), simple, direct et actionnable en français. \
Commence toujours par mentionner la durée et/ou la qualité principale, puis donne une cause probable si identifiable. \
Ne fais jamais de formules de politesse ni d'introduction.`;

const CHAT_SYSTEM = `Tu es un coach sommeil expert qui a accès à l'historique complet de l'utilisateur \
(30 derniers jours de données). Réponds en français, de façon directe et basée sur les vraies données. \
Cite des exemples concrets de son historique quand c'est pertinent (dates, chiffres). \
Sois concis mais complet. Utilise des emojis avec modération pour aérer le texte.`;

const WEEKLY_REPORT_SYSTEM = `Tu es un coach sommeil expert. Génère un rapport hebdomadaire de sommeil \
structuré en français. Format impératif :
1. **Résumé** (1 paragraphe, 3–4 phrases)
2. **Stats clés** (liste à puces : durée moyenne, deep sleep %, REM %, score moyen, FC moy)
3. **Insights corrélations** (3 bullets sur les patterns observés entre lifestyle et sommeil)
4. **Recommandations** (2 actions concrètes pour la semaine suivante)
Sois précis et cite des chiffres réels. Pas de formules de politesse.`;

// ── Context builder ───────────────────────────────────────────────────────────

export function buildSleepContext(
  sleepRecords: SleepRecord[],
  lifestyleLogs: LifestyleLog[],
): string {
  const logMap = new Map(lifestyleLogs.map(l => [l.date, l]));

  const rows = sleepRecords.map(s => {
    const l = logMap.get(s.date);
    const deepPct = s.duration_min > 0
      ? Math.round((s.deep_sleep_min / s.duration_min) * 100)
      : 0;
    const remPct = s.duration_min > 0
      ? Math.round((s.rem_sleep_min / s.duration_min) * 100)
      : 0;
    const durationH = (s.duration_min / 60).toFixed(1);

    let row = `${s.date}: durée=${durationH}h, score=${s.sleep_score}/100, deep=${deepPct}%, REM=${remPct}%, FC_moy=${s.hr_avg}bpm, coucher=${s.sleep_start}, lever=${s.sleep_end}, pas=${s.steps}`;
    if (l) {
      row += ` | caféine=${l.caffeine_mg}mg@${l.caffeine_last_hour}, sport=${l.sport_type}(${l.sport_intensity}/10)@${l.sport_hour}, écran_off=${l.screen_last_hour}, repas=${l.meal_heaviness}@${l.meal_hour}, weed=${l.weed ? 'oui@' + l.weed_hour : 'non'}`;
    }
    return row;
  });

  return `=== HISTORIQUE SOMMEIL & LIFESTYLE (${rows.length} jours) ===\n${rows.join('\n')}`;
}

// ── Morning score (one-shot, cached per day) ──────────────────────────────────

export async function generateMorningScore(
  sleep: SleepRecord,
  lifestyle: LifestyleLog | null,
): Promise<string> {
  const deepPct = sleep.duration_min > 0
    ? Math.round((sleep.deep_sleep_min / sleep.duration_min) * 100)
    : 0;
  const remPct = sleep.duration_min > 0
    ? Math.round((sleep.rem_sleep_min / sleep.duration_min) * 100)
    : 0;
  const durationH = (sleep.duration_min / 60).toFixed(1);

  const sleepData = `Nuit du ${sleep.date} :
- Durée : ${durationH}h (${sleep.duration_min} min)
- Score : ${sleep.sleep_score}/100
- Deep sleep : ${sleep.deep_sleep_min} min (${deepPct}%)
- REM : ${sleep.rem_sleep_min} min (${remPct}%)
- Léger : ${sleep.light_sleep_min} min
- Éveillé : ${sleep.awake_min} min
- FC moyenne nocturne : ${sleep.hr_avg} bpm (min ${sleep.hr_min}, max ${sleep.hr_max})
- Coucher : ${sleep.sleep_start}, Lever : ${sleep.sleep_end}`;

  const lifestyleData = lifestyle
    ? `\nFacteurs veille du ${lifestyle.date} :
- Caféine : ${lifestyle.caffeine_mg}mg, dernière prise à ${lifestyle.caffeine_last_hour}
- Sport : ${lifestyle.sport_type} (intensité ${lifestyle.sport_intensity}/10) à ${lifestyle.sport_hour || 'non précisé'}
- Dernier écran : ${lifestyle.screen_last_hour}
- Repas du soir : ${lifestyle.meal_heaviness} à ${lifestyle.meal_hour}
- Weed : ${lifestyle.weed ? 'oui à ' + lifestyle.weed_hour : 'non'}`
    : '\n(Aucun log lifestyle disponible pour la veille)';

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: MORNING_SCORE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: sleepData + lifestyleData,
            // Cache the per-day data prompt to avoid redundant tokens
            // @ts-ignore — cache_control is valid but types may lag
            cache_control: {type: 'ephemeral'},
          },
        ],
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

// ── Chat (streaming) ──────────────────────────────────────────────────────────

export async function streamChat(
  messages: ChatMessage[],
  sleepContext: string,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  // Convert ChatMessage[] → Anthropic message format
  const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Prepend context as the first user turn (or inject into last user message)
  const contextTurn: Anthropic.MessageParam = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: sleepContext,
        // @ts-ignore
        cache_control: {type: 'ephemeral'},
      },
      {
        type: 'text',
        text: `Question de l'utilisateur : ${messages[messages.length - 1].content}`,
      },
    ],
  };

  // Drop the last user message (it's embedded in contextTurn) and prepend assistant turns
  const historyMessages = apiMessages.slice(0, -1);

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: CHAT_SYSTEM,
        // @ts-ignore
        cache_control: {type: 'ephemeral'},
      },
    ],
    messages: [...historyMessages, contextTurn],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onChunk(event.delta.text);
    }
  }
  onDone();
}

// ── Weekly report (one-shot) ──────────────────────────────────────────────────

export async function generateWeeklyReport(
  sleepRecords: SleepRecord[],
  lifestyleLogs: LifestyleLog[],
): Promise<string> {
  const context = buildSleepContext(sleepRecords, lifestyleLogs);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: WEEKLY_REPORT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: context,
            // @ts-ignore
            cache_control: {type: 'ephemeral'},
          },
          {
            type: 'text',
            text: 'Génère le rapport hebdomadaire pour ces 7 jours.',
          },
        ],
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}
