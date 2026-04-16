import { NextRequest, NextResponse } from 'next/server';
import { neonGetAiInsights, neonUpsertAiInsight } from '@/lib/neon-db';
import type { AiInsight } from '@/lib/types';

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '30', 10);
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 });

  const insights = await neonGetAiInsights(deviceId, limit);
  return NextResponse.json(insights);
}

export async function POST(req: NextRequest) {
  const { deviceId, insight } = await req.json() as {
    deviceId: string;
    insight: Omit<AiInsight, 'id'>;
  };
  if (!deviceId || !insight) {
    return NextResponse.json({ error: 'deviceId and insight required' }, { status: 400 });
  }

  await neonUpsertAiInsight(deviceId, insight);
  return NextResponse.json({ ok: true });
}
