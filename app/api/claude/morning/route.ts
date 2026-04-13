import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import type { SleepRecord, LifestyleLog } from '@/lib/types';

const SYSTEM = `Tu es un coach sommeil expert et bienveillant. \
Analyse les données de sommeil de la nuit dernière et les facteurs lifestyle de la veille. \
Génère un commentaire court (2–3 phrases max), simple, direct et actionnable en français. \
Commence par mentionner la durée et/ou la qualité principale, puis donne une cause probable si identifiable. \
Ne fais jamais de formules de politesse ni d'introduction.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'CLAUDE_API_KEY not configured' }, { status: 500 });
  }

  const { sleep, lifestyle }: { sleep: SleepRecord; lifestyle: LifestyleLog | null } = await req.json();

  const anthropic = new Anthropic({ apiKey });

  const deepPct = sleep.duration_min > 0
    ? Math.round((sleep.deep_sleep_min / sleep.duration_min) * 100) : 0;
  const remPct = sleep.duration_min > 0
    ? Math.round((sleep.rem_sleep_min  / sleep.duration_min) * 100) : 0;
  const durH = (sleep.duration_min / 60).toFixed(1);

  const sleepData = `Nuit du ${sleep.date} :
- Durée : ${durH}h (${sleep.duration_min} min)
- Score : ${sleep.sleep_score}/100
- Deep sleep : ${sleep.deep_sleep_min} min (${deepPct}%)
- REM : ${sleep.rem_sleep_min} min (${remPct}%)
- Éveillé : ${sleep.awake_min} min
- FC nocturne moy : ${sleep.hr_avg} bpm (min ${sleep.hr_min}, max ${sleep.hr_max})
- Coucher : ${sleep.sleep_start}, Lever : ${sleep.sleep_end}`;

  const lifeData = lifestyle
    ? `\nFacteurs veille :
- Caféine : ${lifestyle.caffeine_mg}mg, dernière prise à ${lifestyle.caffeine_last_hour}
- Sport : ${lifestyle.sport_type} (intensité ${lifestyle.sport_intensity}/10) à ${lifestyle.sport_hour || 'non précisé'}
- Dernier écran : ${lifestyle.screen_last_hour}
- Repas du soir : ${lifestyle.meal_heaviness} à ${lifestyle.meal_hour}
- Weed : ${lifestyle.weed ? 'oui à ' + lifestyle.weed_hour : 'non'}`
    : '\n(Aucun log lifestyle disponible)';

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: sleepData + lifeData, cache_control: { type: 'ephemeral' } } as never],
    }],
  });

  const block = message.content[0];
  return NextResponse.json({ content: block.type === 'text' ? block.text : '' });
}
