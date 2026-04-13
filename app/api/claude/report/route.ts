import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import type { SleepRecord, LifestyleLog } from '@/lib/types';
import { buildSleepContext } from '@/lib/claude-client';

const SYSTEM = `Tu es un coach sommeil expert. Génère un rapport hebdomadaire de sommeil \
structuré en français. Format impératif :
1. **Résumé** (1 paragraphe, 3–4 phrases)
2. **Stats clés** (liste à puces : durée moyenne, deep sleep %, REM %, score moyen, FC moy)
3. **Insights corrélations** (3 bullets sur les patterns observés entre lifestyle et sommeil)
4. **Recommandations** (2 actions concrètes pour la semaine suivante)
Sois précis et cite des chiffres réels. Pas de formules de politesse.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'CLAUDE_API_KEY not configured' }, { status: 500 });
  }

  const { sleepRecords, lifestyleLogs }: {
    sleepRecords: SleepRecord[];
    lifestyleLogs: LifestyleLog[];
  } = await req.json();

  const context = buildSleepContext(sleepRecords, lifestyleLogs);
  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: context, cache_control: { type: 'ephemeral' } } as never,
        { type: 'text', text: 'Génère le rapport hebdomadaire pour ces 7 jours.' },
      ],
    }],
  });

  const block = message.content[0];
  return NextResponse.json({ content: block.type === 'text' ? block.text : '' });
}
