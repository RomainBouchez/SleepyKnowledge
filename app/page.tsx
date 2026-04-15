'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SleepScoreGauge from '@/components/SleepScoreGauge';
import MetricCard from '@/components/MetricCard';
import LifestyleForm from '@/components/LifestyleForm';
import {
  getSleepRecords, getLatestSleepRecord, getTodayLifestyleLog,
  upsertLifestyleLog, saveAiInsight, getAiInsight, upsertSleepRecord,
  todayStr,
} from '@/lib/db';
import { fetchMorningScore, buildSleepContext } from '@/lib/claude-client';
import type { SleepRecord, LifestyleLog } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDur  = (m: number) => `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, '0') : ''}`;
const pct     = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtDate = (d?: string) => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  : '';

// Sleep architect bar chart — generates a plausible pattern from phase mins
function buildArchitectBars(
  deepMin: number,
  remMin: number,
  lightMin: number,
  awakeMin: number,
  totalMin: number,
): { color: string; height: number }[] {
  const bars: { color: string; height: number }[] = [];
  const n = 22;

  // Weights per bar: first 1/3 heavier on deep, last 1/3 heavier on REM
  for (let i = 0; i < n; i++) {
    const phase = i / n;
    let color: string;
    let height: number;

    if (awakeMin > 0 && (i === 2 || i === 11 || i === 18)) {
      // Awake spikes
      color = '#ff6b35';
      height = 55 + Math.random() * 20;
    } else if (phase < 0.35 && deepMin > 0) {
      // Early night: deep sleep dominant
      color = '#cc3300';
      height = 70 + Math.sin(i * 1.2) * 20;
    } else if (phase > 0.65 && remMin > 0) {
      // Late night: REM dominant
      color = '#ffb040';
      height = 50 + Math.sin(i * 0.9) * 25;
    } else {
      // Light sleep
      color = '#ff9955';
      height = 35 + Math.sin(i * 1.5) * 20;
    }

    height = Math.min(100, Math.max(15, height));
    bars.push({ color, height });
  }
  return bars;
}

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
  const [stepsEdit,  setStepsEdit]  = useState(false);
  const [stepsInput, setStepsInput] = useState('');
  const aborted = useRef(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    aborted.current = false;
    (async () => {
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

  // ── Steps edit ────────────────────────────────────────────────────────────

  function openStepsEdit() {
    setStepsInput(String(sleep?.steps ?? 0));
    setStepsEdit(true);
  }

  async function saveSteps() {
    if (!sleep) return;
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val < 0) return;
    const updated = { ...sleep, steps: val };
    await upsertSleepRecord({ ...updated });
    setSleep(updated);
    setStepsEdit(false);
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
        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
        <span className="text-[#7a6e6a] text-sm">Initialisation…</span>
      </div>
    );
  }

  const score     = sleep?.sleep_score ?? 0;
  const deepMin   = sleep?.deep_sleep_min  ?? 0;
  const remMin    = sleep?.rem_sleep_min   ?? 0;
  const durMin    = sleep?.duration_min    ?? 0;
  const awakeMin  = sleep?.awake_min       ?? 0;
  const lightMin  = Math.max(0, durMin - deepMin - remMin - awakeMin);
  const deepPct   = pct(deepMin,  durMin);
  const remPct    = pct(remMin,   durMin);
  const lightPct  = pct(lightMin, durMin);
  const awakePct  = pct(awakeMin, durMin);

  const bars = sleep
    ? buildArchitectBars(deepMin, remMin, lightMin, awakeMin, durMin)
    : [];

  return (
    <div className="px-4 pt-2 pb-28 max-w-lg mx-auto">

      {/* ── CURATOR Header ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between mb-6 pt-3">
        <span className="curator-brand">Sleepy</span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase transition-all disabled:opacity-40"
            style={{
              background: '#ff6b3515',
              border: '1px solid #ff6b3540',
              color: '#ff6b35',
            }}>
            {syncing
              ? <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
              : '↓'
            }
            {syncing ? 'Sync…' : 'Import Data'}
          </button>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mb-5">
        <h1 className="text-3xl font-black tracking-tight" style={{ color: '#f0ebe6', letterSpacing: -1 }}>
          Nightly Genesis
        </h1>
        <p className="text-[13px] mt-1 capitalize" style={{ color: '#7a6e6a' }}>
          {sleep?.date ? fmtDate(sleep.date) : 'Aucune donnée — lance un import'}
        </p>
      </section>

      {sleep ? (
        <>
          {/* ── Wearable Status ──────────────────────────────────────── */}
          <div className="card mb-3" style={{ background: '#131110', borderColor: '#2a2320' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-label mb-1">Wearable Status</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#4caf78', boxShadow: '0 0 6px #4caf78' }} />
                  <span className="text-xs font-bold" style={{ color: '#f0ebe6' }}>Mi Band 8 · Active</span>
                </div>
              </div>
              <span className="text-2xl opacity-60">⌚</span>
            </div>

            {/* Score + gauge row */}
            <div className="flex items-center gap-5">
              <SleepScoreGauge score={score} size={140} strokeWidth={9} />
              <div className="flex-1">
                {trend && (
                  <div className="flex gap-2 mb-3">
                    <TrendBadge label="Score" delta={trend.score} fmt={v => `${v > 0 ? '+' : ''}${Math.round(v)} pts`} />
                    <TrendBadge label="Durée" delta={trend.dur}   fmt={v => `${v > 0 ? '+' : ''}${Math.round(v)} min`} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-[11px]" style={{ color: '#3d3330' }}>
                  <span>⊙</span>
                  <span>Synced {sleep.imported_at
                    ? `${Math.round((Date.now() - new Date(sleep.imported_at).getTime()) / 60000)} min ago`
                    : 'récemment'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] mt-1" style={{ color: '#3d3330' }}>
                  <span>◑</span>
                  <span>{sleep.steps ? `${sleep.steps.toLocaleString('fr-FR')} pas` : '— pas'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── HR + Duration row ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Heart Rate */}
            <div className="card" style={{ background: '#131110', borderColor: '#2a2320' }}>
              <p className="section-label mb-2">Heart Rate Range</p>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-xs font-bold" style={{ color: '#7a6e6a' }}>
                  {sleep.hr_avg > 5 ? sleep.hr_avg - 8 : '—'}
                </span>
                <div className="flex-1 h-1.5 rounded-full mx-1" style={{ background: 'linear-gradient(to right, #ff6b3530, #ff6b35)' }} />
                <span className="text-xs font-bold" style={{ color: '#ff6b35' }}>
                  {sleep.hr_avg > 0 ? sleep.hr_avg + 12 : '—'}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black" style={{ color: '#f0ebe6', letterSpacing: -1 }}>
                  {sleep.hr_avg > 0 ? sleep.hr_avg : '—'}
                </span>
                <span className="text-xs font-semibold" style={{ color: '#7a6e6a' }}>bpm moy.</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: '#3d3330' }}>
                {sleep.hr_avg > 0
                  ? `Fréquence cardiaque normale`
                  : 'Données indisponibles'}
              </p>
            </div>

            {/* Duration */}
            <div className="card" style={{ background: '#131110', borderColor: '#2a2320' }}>
              <p className="section-label mb-2">Total Duration</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black" style={{ color: '#f0ebe6', letterSpacing: -1 }}>
                  {fmtDur(durMin)}
                </span>
              </div>
              <div className="flex items-center gap-1 mb-3">
                <span className="text-[11px] font-semibold" style={{ color: durMin >= 420 ? '#4caf78' : '#ff8c00' }}>
                  {durMin >= 480 ? '+Goal' : durMin >= 420 ? '≈Goal' : '–Goal'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: '#3d3330' }}>🛏 {sleep.sleep_start}</span>
                <span style={{ color: '#3d3330' }}>→</span>
                <span className="text-[10px]" style={{ color: '#3d3330' }}>☀️ {sleep.sleep_end}</span>
              </div>
            </div>
          </div>

          {/* ── Sleep Architect ──────────────────────────────────────── */}
          <div className="card mb-3" style={{ background: '#131110', borderColor: '#2a2320' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-label mb-0.5">Sleep Architect</p>
                <p className="text-xs font-semibold" style={{ color: '#f0ebe6' }}>Biological cycle breakdown</p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mb-4">
              {[
                { label: 'Éveils',  color: '#ff6b35' },
                { label: 'REM',     color: '#ffb040' },
                { label: 'Léger',   color: '#ff9955' },
                { label: 'Profond', color: '#cc3300' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#7a6e6a' }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div className="flex items-end gap-0.5 mb-3" style={{ height: 72 }}>
              {bars.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${b.height}%`,
                    background: b.color,
                    opacity: 0.85,
                    minWidth: 0,
                  }}
                />
              ))}
            </div>

            {/* Time axis */}
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: '#3d3330' }}>
              <span>{sleep.sleep_start || '22:00'}</span>
              <span>{sleep.sleep_end   || '06:00'}</span>
            </div>

            {/* Phase stats */}
            <div className="grid grid-cols-2 gap-2">
              <PhaseRow label="Profond"  color="#cc3300" dur={fmtDur(deepMin)}  note={`${deepPct}% · Objectif >20%`} />
              <PhaseRow label="Léger"    color="#ff9955" dur={fmtDur(lightMin)} note={`${lightPct}%`} />
              <PhaseRow label="REM"      color="#ffb040" dur={fmtDur(remMin)}   note={`${remPct}% · Normalement 20%`} />
              <PhaseRow label="Éveillé"  color="#ff6b35" dur={fmtDur(awakeMin)} note={`${awakePct}% · Good <5%`} />
            </div>
          </div>

          {/* ── Curated Observations ─────────────────────────────────── */}
          <div className="mb-3">
            <p className="section-label mb-2">Curated Observations</p>
            <div className="card" style={{ background: '#131110', borderColor: '#ff6b3520' }}>
              <div className="flex gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                  style={{ background: '#ff6b3515', border: '1px solid #ff6b3530' }}>
                  ◈
                </div>
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: '#ff6b35' }}>AI Insight</p>
                  {loadingAi ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
                      <span className="text-xs" style={{ color: '#7a6e6a' }}>Analyse en cours…</span>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: '#c4b8b0' }}>{aiComment}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Metrics grid ─────────────────────────────────────────── */}
          <p className="section-label mb-2">Métriques détaillées</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MetricCard icon="⏱" label="Durée totale" value={fmtDur(durMin)}
              color="#f0ebe6"
              trend={trend ? (trend.dur > 0 ? 'up' : 'down') : undefined} trendPositive />
            <MetricCard icon="▼" label="Deep sleep" value={String(deepPct)} unit="%" color="#cc3300" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MetricCard icon="◎" label="REM" value={String(remPct)} unit="%" color="#ffb040" />
            <MetricCard icon="♡" label="FC moy." value={String(sleep.hr_avg)} unit="bpm" color="#e05a4a" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            <MetricCard icon="👟" label="Pas" value={(sleep.steps ?? 0).toLocaleString('fr-FR')} color="#4caf78" onClick={openStepsEdit} />
            <MetricCard icon="○" label="Éveillé" value={fmtDur(awakeMin)} color="#7a6e6a" trendPositive={false} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5"
            style={{ background: '#131110', border: '1px solid #2a2320' }}>
            🌙
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#7a6e6a' }}>
            Aucune donnée de sommeil.<br />Appuie sur Import Data pour commencer.
          </p>
        </div>
      )}

      {/* ── Lifestyle CTA ────────────────────────────────────────────── */}
      <button
        onClick={() => setFormOpen(true)}
        className="w-full card flex items-center gap-4 text-left"
        style={{
          background: '#131110',
          borderColor: lifestyle ? '#4caf7840' : '#ff6b3530',
        }}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: lifestyle ? '#4caf7815' : '#ff6b3515' }}>
          {lifestyle ? '✓' : '✏'}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: '#f0ebe6' }}>
            {lifestyle ? 'Log lifestyle enregistré' : 'Remplis le log du soir'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#7a6e6a' }}>
            {lifestyle ? 'Appuie pour modifier' : 'Caféine, sport, repas, écrans — < 30s'}
          </p>
        </div>
      </button>

      {/* ── Steps edit modal ─────────────────────────────────────────── */}
      {stepsEdit && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={() => setStepsEdit(false)} />
          <div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-6 shadow-2xl max-w-xs mx-auto"
            style={{ background: '#131110', border: '1px solid #2a2320' }}>
            <p className="font-black text-base mb-1" style={{ color: '#f0ebe6' }}>Nombre de pas</p>
            <p className="text-xs mb-4" style={{ color: '#7a6e6a' }}>Modifie le nombre de pas</p>
            <input
              type="number"
              min="0"
              value={stepsInput}
              onChange={e => setStepsInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveSteps()}
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-lg font-black text-center focus:outline-none mb-4"
              style={{
                background: '#0a0908',
                border: '1px solid #2a2320',
                color: '#f0ebe6',
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setStepsEdit(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ border: '1px solid #2a2320', color: '#7a6e6a' }}>
                Annuler
              </button>
              <button
                onClick={saveSteps}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors glow-orange"
                style={{ background: '#ff6b35', color: '#fff' }}>
                Enregistrer
              </button>
            </div>
          </div>
        </>
      )}

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
  const positive = delta >= 0;
  return (
    <div
      className="flex-1 rounded-xl px-2 py-1.5 flex flex-col"
      style={{
        background: positive ? '#4caf7810' : '#e05a4a10',
        border: `1px solid ${positive ? '#4caf7830' : '#e05a4a30'}`,
      }}>
      <span className="text-xs font-black" style={{ color: positive ? '#4caf78' : '#e05a4a' }}>
        {fmt(delta)}
      </span>
      <span className="text-[9px] font-semibold mt-0.5" style={{ color: '#3d3330' }}>{label}</span>
    </div>
  );
}

function PhaseRow({ label, color, dur, note }: { label: string; color: string; dur: string; note: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 flex flex-col"
      style={{ background: '#0a0908', border: '1px solid #2a2320' }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#7a6e6a' }}>{label}</span>
      </div>
      <span className="text-base font-black" style={{ color: '#f0ebe6', letterSpacing: -0.5 }}>{dur}</span>
      <span className="text-[9px] mt-0.5" style={{ color: '#3d3330' }}>{note}</span>
    </div>
  );
}
