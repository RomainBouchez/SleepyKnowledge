import { NextRequest, NextResponse } from 'next/server';
import { neonGetSleepRecords, neonUpsertSleepRecord } from '@/lib/neon-db';
import type { SleepRecord } from '@/lib/types';

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id');
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10);
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 });

  const records = await neonGetSleepRecords(deviceId, days);
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const { deviceId, records } = await req.json() as {
    deviceId: string;
    records: Omit<SleepRecord, 'id'>[];
  };
  if (!deviceId || !records?.length) {
    return NextResponse.json({ error: 'deviceId and records required' }, { status: 400 });
  }

  await Promise.all(records.map((r) => neonUpsertSleepRecord(deviceId, r)));
  return NextResponse.json({ ok: true, count: records.length });
}
