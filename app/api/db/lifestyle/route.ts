import { NextRequest, NextResponse } from 'next/server';
import { neonGetLifestyleLogs, neonUpsertLifestyleLog } from '@/lib/neon-db';
import type { LifestyleLog } from '@/lib/types';

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id');
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10);
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 });

  const logs = await neonGetLifestyleLogs(deviceId, days);
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const { deviceId, logs } = await req.json() as {
    deviceId: string;
    logs: Omit<LifestyleLog, 'id'>[];
  };
  if (!deviceId || !logs?.length) {
    return NextResponse.json({ error: 'deviceId and logs required' }, { status: 400 });
  }

  await Promise.all(logs.map((l) => neonUpsertLifestyleLog(deviceId, l)));
  return NextResponse.json({ ok: true, count: logs.length });
}
