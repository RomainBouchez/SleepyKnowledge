/**
 * Proxies the VPS/n8n sync request so SYNC_ENDPOINT_URL and SYNC_SECRET_TOKEN
 * stay server-side and never appear in the browser bundle.
 */
import { NextResponse } from 'next/server';
import type { SyncPayload } from '@/lib/types';

export async function GET() {
  const url   = process.env.SYNC_ENDPOINT_URL;
  const token = process.env.SYNC_SECRET_TOKEN;

  if (!url) {
    return NextResponse.json(
      { error: 'SYNC_ENDPOINT_URL not configured in environment' },
      { status: 500 },
    );
  }

  const headers: Record<string, string> = {};
  if (token) headers['X-SleepIQ-Token'] = token;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `VPS returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const payload = (await res.json()) as SyncPayload;
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Network error' },
      { status: 502 },
    );
  }
}
