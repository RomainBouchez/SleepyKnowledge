import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { NextRequest } from 'next/server';
import type { ChatMessage } from '@/lib/types';

const SYSTEM = `Tu es un coach sommeil expert qui a accès à l'historique complet de l'utilisateur \
(30 derniers jours de données). Réponds en français, de façon directe et basée sur les vraies données. \
Cite des exemples concrets de son historique quand c'est pertinent (dates, chiffres). \
Sois concis mais complet. Utilise des emojis avec modération.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response('GEMINI_API_KEY not configured', { status: 500 });
  }

  const { messages, context }: { messages: ChatMessage[]; context: string } = await req.json();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM,
  });

  // Convert history (all but last message), 'assistant' → 'model'
  const history: Content[] = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastUserContent = messages[messages.length - 1]?.content ?? '';
  const userMessage = `${context}\n\nQuestion : ${lastUserContent}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(userMessage);

        for await (const chunk of result.stream) {
          controller.enqueue(encoder.encode(chunk.text()));
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
