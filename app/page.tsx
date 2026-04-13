'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SleepScoreGauge from '@/components/SleepScoreGauge';
import MetricCard from '@/components/MetricCard';
import LifestyleForm from '@/components/LifestyleForm';
import {
  getSleepRecords, getLatestSleepRecord, getTodayLifestyleLog,
  getLifestyleLogs, upsertLifestyleLog, saveAiInsight, getAiInsight,
  seedTestData, todayStr,
} from '@/lib/db';
import { fetchMorningScore, buildSleepContext } from '@/lib/claude-client';
import type { SleepRecord, LifestyleLog } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDur  = (m: number) => `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, '0') : ''}`;
const pct     = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtDate = (d?: string) => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  : '';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [ready,      setReady]      = useState(false);
  const [sleep,      setSleep]      = useState<SleepRecord | null>(null);
  const [lifestyle,  setLifestyle]  = useState<LifestyleLog | null>(null);
  const [aiComment,  setAiComment]  = useState('');
  const [loadingAi,  setLoadingAi]  = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [formOpen,   setFormOpen]   = useState(false);
  const [trend,      setTrend]      = useState<{ score: number; dur: number } | null>(null);
  const aborted = useRef(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    aborted.current = false;
    (async () => {
      await seedTestData();
      await loadData();
      setReady(true);
    })();
    return () => { aborted.current = true; };
  }, []);

  const loadData = useCallback(async () => {
    const [latestSleep, todayLog, allRecords] = await Promise.all([
      getLatestSleepRecord(),
      getTodayLifestyleLog(),
      getSleepRecords(14),
    ]);

    setSleep(latestSleep);
    setLifestyle(todayLog);

    if (allRecords.length >= 2) {
      const recent = allRecords.slice(-7);
      const prev   = allRecords.slice(-14, -7);
      if (recent.length && prev.length) {
        const avg = (arr: SleepRecord[], k: keyof SleepRecord) =>
          arr.reduce((s, r) => s + Number(r[k]), 0) / arr.length;
        setTrend({
          score: avg(recent, 'sleep_score') - avg(prev, 'sleep_score'),
          dur:   avg(recent, 'duration_min') - avg(prev, 'duration_min'),
        });
      }
    }

    if (latestSleep) await loadAiComment(latestSleep, todayLog);
  }, []);

  // ── AI comment ────────────────────────────────────────────────────────────

  async function loadAiComment(sleepRec: SleepRecord, log: LifestyleLog | null) {
    const cached = await getAiInsight(sleepRec.date, 'morning_score');
    if (cached) { setAiComment(cached.content); return; }

    setLoadingAi(true);
    try {
      const comment = await fetchMorningScore(sleepRec, log);
      if (!aborted.current) {
        setAiComment(comment);
        await saveAiInsight({ date: sleepRec.date, type: 'morning_score', content: comment, generated_at: new Date().toISOString() });
      }
    } catch {
      if (!aborted.current) setAiComment('Coach IA indisponible pour l\'instant.');
    } finally {
      if (!aborted.current) setLoadingAi(false);
    }
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (!res.ok) { alert(`Erreur sync: ${data.error}`); return; }
      const { upsertSleepRecord } = await import('@/lib/db');
      for (const r of data.sleep ?? []) {
        await upsertSleepRecord({ ...r, imported_at: new Date().toISOString() });
      }
      await loadData();
    } finally {
      setSyncing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen gap-3">
        <div className="w-5 h-5 border-2 border-sl-blue border-t-transparent rounded-full animate-spin" />
        <span className="text-sl-gray text-sm">Initialisation…</span>
      </div>
    );
  }

  const score    = sleep?.sleep_score ?? 0;
  const deepPct  = pct(sleep?.deep_sleep_min ?? 0, sleep?.duration_min ?? 1);
  const remPct   = pct(sleep?.rem_sleep_min  ?? 0, sleep?.duration_min ?? 1);

  return (
    <div className="px-4 pt-4 pb-6 max-w-lg mx-auto">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-sl-white">Bonjour 👋</h1>
          <p className="text-sl-gray text-xs mt-0.5 capitalize">{fmtDate(sleep?.date)}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-semibold text-sl-blue bg-sl-surface2 border border-sl-border rounded-lg px-3 py-1.5 disabled:opacity-50">
          {syncing
            ? <span className="w-3 h-3 border border-sl-blue border-t-transparent rounded-full animate-spin" />
            : '↓'} Sync
        </button>
      </div>

      {/* ── Score ────────────────────────────────────────────────────── */}
      {sleep ? (
        <>
          <div className="flex flex-col items-center mb-5">
            <SleepScoreGauge score={score} />

            {/* AI Comment */}
            <div className="card w-full mt-4">
              {loadingAi ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-4 h-4 border-2 border-sl-blue border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="text-sl-gray text-sm">Analyse en cours…</span>
                </div>
              ) : (
                <p className="text-sl-white text-sm leading-relaxed">{aiComment}</p>
              )}
            </div>

            {/* Trend badges */}
            {trend && (
              <div className="flex gap-2 mt-3 w-full">
                <TrendBadge label="Score" delta={trend.score} fmt={v => `${v > 0 ? '+' : ''}${Math.round(v)} pts`} />
                <TrendBadge label="Durée" delta={trend.dur}   fmt={v => `${v > 0 ? '+' : ''}${Math.round(v)} min`} />
              </div>
            )}
          </div>

          {/* ── Metrics ────────────────────────────────────────────────── */}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray mb-2">Métriques</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MetricCard icon="⏱" label="Durée totale" value={fmtDur(sleep.duration_min)}
              color="#F1F5F9"
              trend={trend ? (trend.dur > 0 ? 'up' : 'down') : undefined} trendPositive />
            <MetricCard icon="🌊" label="Deep sleep" value={String(deepPct)} unit="%" color="#3B82F6" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MetricCard icon="💜" label="REM" value={String(remPct)} unit="%" color="#8B5CF6" />
            <MetricCard icon="❤️" label="FC moy." value={String(sleep.hr_avg)} unit="bpm" color="#EF4444" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MetricCard icon="🛏" label="Coucher" value={sleep.sleep_start} color="#F1F5F9" />
            <MetricCard icon="☀️" label="Lever" value={sleep.sleep_end} color="#F1F5F9" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            <MetricCard icon="👟" label="Pas" value={(sleep.steps ?? 0).toLocaleString('fr-FR')} color="#22C55E" />
            <MetricCard icon="😴" label="Éveillé" value={fmtDur(sleep.awake_min)} color="#94A3B8" trendPositive={false} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">🌙</span>
          <p className="text-sl-gray text-sm leading-relaxed">
            Aucune donnée de sommeil.<br />Appuie sur Sync pour importer.
          </p>
        </div>
      )}

      {/* ── Lifestyle CTA ────────────────────────────────────────────── */}
      <button
        onClick={() => setFormOpen(true)}
        className="w-full card flex items-center gap-4 text-left"
        style={{ borderColor: lifestyle ? '#22C55E44' : '#3B82F644' }}>
        <span className="text-3xl">{lifestyle ? '✅' : '✏️'}</span>
        <div>
          <p className="text-sl-white text-sm font-semibold">
            {lifestyle ? 'Log lifestyle enregistré' : 'Remplis le log du soir'}
          </p>
          <p className="text-sl-gray text-xs mt-0.5">
            {lifestyle ? 'Appuie pour modifier' : 'Caféine, sport, repas, écrans — < 30s'}
          </p>
        </div>
      </button>

      {/* ── Lifestyle Form ────────────────────────────────────────────── */}
      <LifestyleForm
        visible={formOpen}
        initial={lifestyle}
        todaySteps={sleep?.steps ?? 0}
        onSave={async log => { await upsertLifestyleLog(log); setLifestyle(await getTodayLifestyleLog()); }}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendBadge({ label, delta, fmt }: { label: string; delta: number; fmt: (v: number) => string }) {
  const color = delta >= 0 ? '#22C55E' : '#EF4444';
  return (
    <div className="flex-1 card flex flex-col" style={{ borderColor: color + '44', padding: '10px 12px' }}>
      <span className="text-sm font-bold" style={{ color }}>{fmt(delta)}</span>
      <span className="text-[10px] text-sl-muted mt-0.5">{label} vs semaine passée</span>
    </div>
  );
}
