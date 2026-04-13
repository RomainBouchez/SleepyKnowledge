'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import { getSleepRecords, getLifestyleLogs } from '@/lib/db';
import type { SleepRecord, LifestyleLog, CorrelationPoint } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Range = '7j' | '30j';
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
const shortDate = (d: string) => { const dt = new Date(d + 'T12:00:00'); return `${dt.getDate()}/${dt.getMonth() + 1}`; };

function pearson(pts: CorrelationPoint[]): number {
  const n = pts.length;
  if (n < 2) return 0;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const num = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = Math.sqrt(
    pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) *
    pts.reduce((s, p) => s + (p.y - my) ** 2, 0));
  return den === 0 ? 0 : num / den;
}

function corrLabel(r: number) {
  const a = Math.abs(r), dir = r >= 0 ? 'positive' : 'négative';
  if (a > 0.6) return `Forte corrélation ${dir}`;
  if (a > 0.3) return `Corrélation ${dir} modérée`;
  return 'Pas de corrélation claire';
}

// ── Chart theme ───────────────────────────────────────────────────────────────

const AXIS_STYLE = { fill: '#475569', fontSize: 10 };
const GRID_COLOR = '#1E293B';
const TOOLTIP_STYLE = {
  contentStyle: { background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 },
  labelStyle: { color: '#94A3B8', fontSize: 11 },
  itemStyle: { color: '#F1F5F9', fontSize: 12 },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PatternsPage() {
  const [range, setRange]   = useState<Range>('7j');
  const [sleep,  setSleep]  = useState<SleepRecord[]>([]);
  const [logs,   setLogs]   = useState<LifestyleLog[]>([]);
  const [ready,  setReady]  = useState(false);

  useEffect(() => {
    (async () => {
      const [sr, ll] = await Promise.all([getSleepRecords(30), getLifestyleLogs(30)]);
      setSleep(sr); setLogs(ll); setReady(true);
    })();
  }, []);

  const displayed = range === '7j' ? sleep.slice(-7) : sleep;
  const logMap    = new Map(logs.map(l => [l.date, l]));

  // Chart data
  const scoreData    = displayed.map(r => ({ x: shortDate(r.date), y: r.sleep_score }));
  const durData      = displayed.map(r => ({ x: shortDate(r.date), y: Math.round(r.duration_min / 60 * 10) / 10 }));
  // Combined deep+REM in a single array (required by Recharts LineChart)
  const sleepPhaseData = displayed.map(r => ({
    x:    shortDate(r.date),
    deep: pct(r.deep_sleep_min, r.duration_min),
    rem:  pct(r.rem_sleep_min,  r.duration_min),
  }));

  // Correlation datasets
  function buildCorr(
    title: string, xLabel: string, yLabel: string, color: string,
    getX: (l: LifestyleLog) => number,
    getY: (r: SleepRecord) => number,
  ) {
    const pts: CorrelationPoint[] = sleep.flatMap(r => {
      const l = logMap.get(r.date);
      if (!l || getX(l) === 0) return [];
      return [{ x: getX(l), y: getY(r), date: r.date }];
    });
    return { title, xLabel, yLabel, color, pts, r: pearson(pts) };
  }

  const corrs = [
    buildCorr('☕ Caféine → Deep sleep', 'Caféine (mg)', 'Deep sleep (%)', '#3B82F6',
      l => l.caffeine_mg, r => pct(r.deep_sleep_min, r.duration_min)),
    buildCorr('🌿 Weed → REM', 'Weed (0/1)', 'REM (%)', '#8B5CF6',
      l => l.weed ? 1 : 0, r => pct(r.rem_sleep_min, r.duration_min)),
    buildCorr('🏋️ Intensité sport → Score', 'Intensité (1–10)', 'Score', '#22C55E',
      l => l.sport_intensity, r => r.sleep_score),
    buildCorr('🍽️ Repas → FC nocturne', 'Repas (1=léger,3=lourd)', 'FC moy (bpm)', '#F59E0B',
      l => l.meal_heaviness === 'léger' ? 1 : l.meal_heaviness === 'normal' ? 2 : 3,
      r => r.hr_avg),
  ];

  const topFactors = [...corrs].filter(c => c.pts.length >= 5).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  if (!ready) {
    return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
  }

  if (sleep.length < 3) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-8">
        <span className="text-5xl mb-4">📊</span>
        <p className="text-sl-gray text-sm leading-relaxed">
          Pas assez de données.<br />Synchronise quelques nuits d'abord.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-lg mx-auto space-y-4">

      {/* ── Header + range ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-sl-white">Patterns 📊</h1>
        <div className="flex bg-sl-surface2 rounded-lg p-0.5">
          {(['7j', '30j'] as Range[]).map(r => (
            <button key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                range === r ? 'bg-sl-blue text-white' : 'text-sl-gray'
              }`}>{r}</button>
          ))}
        </div>
      </div>

      {/* ── Score trend ────────────────────────────────────────────── */}
      <ChartCard title="Score de sommeil">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={scoreData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="x" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={AXIS_STYLE} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="y" stroke="#3B82F6" fill="#3B82F622" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Duration ───────────────────────────────────────────────── */}
      <ChartCard title="Durée de sommeil (h)">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={durData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="x" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_STYLE} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="y" stroke="#06B6D4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Deep + REM ─────────────────────────────────────────────── */}
      <ChartCard title="Deep sleep & REM (%)">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sleepPhaseData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="x" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_STYLE} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="deep" stroke="#3B82F6" strokeWidth={2} dot={false} name="Deep" />
            <Line type="monotone" dataKey="rem"  stroke="#8B5CF6" strokeWidth={2} dot={false} name="REM" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1">
          <Legend color="#3B82F6" label="Deep sleep" />
          <Legend color="#8B5CF6" label="REM" />
        </div>
      </ChartCard>

      {/* ── Correlations ───────────────────────────────────────────── */}
      <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray pt-2">
        Corrélations lifestyle → sommeil
      </p>

      {corrs.map((c, i) => (
        <ChartCard key={i} title={c.title}>
          {c.pts.length < 5 ? (
            <p className="text-sl-muted text-xs italic py-2">Pas assez de données (min. 5 nuits)</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <ScatterChart margin={{ top: 4, right: 4, bottom: 16, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="x" type="number" name={c.xLabel} tick={AXIS_STYLE}
                    label={{ value: c.xLabel, position: 'insideBottom', offset: -8, fill: '#475569', fontSize: 9 }} />
                  <YAxis dataKey="y" type="number" name={c.yLabel} tick={AXIS_STYLE} />
                  <Tooltip {...TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={c.pts} fill={c.color} opacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: c.color + '22', color: c.color }}>
                  r = {c.r.toFixed(2)}
                </span>
                <span className="text-xs text-sl-gray">{corrLabel(c.r)}</span>
              </div>
            </>
          )}
        </ChartCard>
      ))}

      {/* ── Top factors ────────────────────────────────────────────── */}
      {topFactors.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray pt-2">
            Top facteurs du mois
          </p>
          <div className="card space-y-0 divide-y divide-sl-border">
            {topFactors.slice(0, 3).map((f, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <span className="text-sl-muted font-bold text-sm w-6">#{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sl-white text-sm font-semibold">{f.title}</p>
                  <p className="text-sl-gray text-xs mt-0.5">{corrLabel(f.r)} (r={f.r.toFixed(2)})</p>
                </div>
                <span className="font-bold" style={{ color: f.r >= 0 ? '#22C55E' : '#EF4444' }}>
                  {f.r >= 0 ? '▲' : '▼'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray mb-3">{title}</p>
      {children}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-xs text-sl-gray">{label}</span>
    </div>
  );
}

function Spinner() {
  return <div className="w-6 h-6 border-2 border-sl-blue border-t-transparent rounded-full animate-spin" />;
}
