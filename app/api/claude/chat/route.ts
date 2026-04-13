import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import type { ChatMessage } from '@/lib/types';

const SYSTEM = `Tu es un coach sommeil expert qui a accès à l'historique complet de l'utilisateur \
(30 derniers jours de données). Réponds en français, de façon directe et basée sur les vraies données. \
Cite des exemples concrets de son historique quand c'est pertinent (dates, chiffres). \
Sois concis mais complet. Utilise des emojis avec modération.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return new Response('CLAUDE_API_KEY not configured', { status: 500 });
  }

  const { messages, context }: { messages: ChatMessage[]; context: string } = await req.json();

  const anthropic = new Anthropic({ apiKey });

  // History without the last user message (we'll embed it with context)
  const history: Anthropic.MessageParam[] = messages.slice(0, -1).map(m => ({
    role: m.role,
    content: m.content,
  }));

  const lastUserContent = messages[messages.length - 1]?.content ?? '';

  const contextTurn: Anthropic.MessageParam = {
    role: 'user',
    content: [
      { type: 'text', text: context, cache_control: { type: 'ephemeral' } } as never,
      { type: 'text', text: `Question : ${lastUserContent}` },
    ],
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const apiStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } } as never],
          messages: [...history, contextTurn],
        });

        for await (const event of apiStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
