'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LifestyleForm from '@/components/LifestyleForm';
import {
  getSleepRecords, getLatestSleepRecord, getTodayLifestyleLog,
  upsertLifestyleLog, saveAiInsight, getAiInsight, upsertSleepRecord,
  getLifestyleLogByDate,
} from '@/lib/db';
import { fetchMorningScore } from '@/lib/claude-client';
import type { SleepRecord, LifestyleLog } from '@/lib/types';

const fmtDur  = (m: number) => `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, '0') : ''}`;
const pct     = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtDate = (d?: string) => {
  if (!d) return '';
  const dateOnly = d.substring(0, 10);
  return new Date(dateOnly + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Profond=4 (petit/sombre) → Léger=3 → REM=2 → Éveillé=5 (grand/jaune)
const ARCH_STAGE: Record<number, { color: string; height: number }> = {
  4: { color: '#7a1500', height: 18 }, // profond – rouge foncé, barre basse
  3: { color: '#cc3300', height: 42 }, // léger   – orange foncé
  2: { color: '#ff9955', height: 65 }, // REM     – orange clair
  5: { color: '#ffd040', height: 90 }, // éveillé – jaune,    barre haute
};

function buildArchitectBars(
  stagesJson: string | null | undefined,
  deepMin: number, lightMin: number, remMin: number, awakeMin: number,
): { color: string; height: number; flex: number }[] {
  // Vraies données : largeur ∝ durée du segment
  if (stagesJson) {
    try {
      const items = JSON.parse(stagesJson) as { state: number; start_time: number; end_time: number }[];
      if (items.length > 0) {
        const totalSec = items.reduce((s, it) => s + (it.end_time - it.start_time), 0) || 1;
        return items.map(it => {
          const cfg = ARCH_STAGE[it.state] ?? ARCH_STAGE[3];
          return { color: cfg.color, height: cfg.height, flex: (it.end_time - it.start_time) / totalSec };
        });
      }
    } catch { /* JSON corrompu */ }
  }
  // Fallback simulé quand pas de données granulaires
  const total = deepMin + lightMin + remMin + awakeMin || 1;
  const segments: { state: number; min: number }[] = [
    { state: 4, min: deepMin },
    { state: 3, min: lightMin * 0.4 },
    { state: 2, min: remMin * 0.5 },
    { state: 3, min: lightMin * 0.4 },
    { state: 2, min: remMin * 0.5 },
    { state: 5, min: awakeMin },
    { state: 3, min: lightMin * 0.2 },
  ].filter(s => s.min > 0);
  return segments.map(s => {
    const cfg = ARCH_STAGE[s.state];
    return { color: cfg.color, height: cfg.height, flex: s.min / total };
  });
}

function glass(radius = 22, tint = 0.08, border = 0.12): React.CSSProperties {
  return {
    background: `rgba(255,255,255,${tint})`,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: `1px solid rgba(255,255,255,${border})`,
    borderRadius: radius,
    boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.1) inset, 0 8px 24px rgba(0,0,0,0.35)',
  };
}

export default function DashboardPage() {
  const [ready,       setReady]       = useState(false);
  const [allRecords,  setAllRecords]  = useState<SleepRecord[]>([]);
  const [currentIdx,  setCurrentIdx]  = useState(-1);
  const [sleep,       setSleep]       = useState<SleepRecord | null>(null);
  const [lifestyle,   setLifestyle]   = useState<LifestyleLog | null>(null);
  const [aiComment,   setAiComment]   = useState('');
  const [loadingAi,   setLoadingAi]   = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [formOpen,    setFormOpen]    = useState(false);
  const [trend,       setTrend]       = useState<{ score: number; dur: number } | null>(null);
  const [stepsEdit,   setStepsEdit]   = useState(false);
  const [stepsInput,  setStepsInput]  = useState('');
  const [expanded,    setExpanded]    = useState<'architect' | 'observation' | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const heroRef = useRef<HTMLDivElement>(null);
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    (async () => { await loadData(); setReady(true); })();
    return () => { aborted.current = true; };
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.intersectionRatio >= 0.5),
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ready]);

  const loadData = useCallback(async () => {
    const [latestSleep, todayLog, records] = await Promise.all([
      getLatestSleepRecord(), getTodayLifestyleLog(), getSleepRecords(60),
    ]);
    setAllRecords(records);
    const idx = records.length > 0 ? records.length - 1 : -1;
    setCurrentIdx(idx);
    setSleep(latestSleep);
    setLifestyle(todayLog);
    if (records.length >= 2) {
      const recent = records.slice(-7);
      const prev   = records.slice(-14, -7);
      if (recent.length && prev.length) {
        const avg = (arr: SleepRecord[], k: keyof SleepRecord) =>
          arr.reduce((s, r) => s + Number(r[k]), 0) / arr.length;
        setTrend({ score: avg(recent, 'sleep_score') - avg(prev, 'sleep_score'), dur: avg(recent, 'duration_min') - avg(prev, 'duration_min') });
      }
    }
    if (latestSleep) await loadAiComment(latestSleep, todayLog);
  }, []);

  const navigateDay = useCallback(async (dir: -1 | 1) => {
    const newIdx = currentIdx + dir;
    if (newIdx < 0 || newIdx >= allRecords.length) return;
    aborted.current = false;
    setCurrentIdx(newIdx);
    setExpanded(null);
    const rec = allRecords[newIdx];
    setSleep(rec);
    setAiComment('');
    const log = await getLifestyleLogByDate(rec.date);
    setLifestyle(log);
    await loadAiComment(rec, log);
  }, [currentIdx, allRecords]);

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
      if (!aborted.current) setAiComment("Coach IA indisponible pour l'instant.");
    } finally {
      if (!aborted.current) setLoadingAi(false);
    }
  }

  function openStepsEdit() { setStepsInput(String(sleep?.steps ?? 0)); setStepsEdit(true); }

  async function saveSteps() {
    if (!sleep) return;
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val < 0) return;
    const updated = { ...sleep, steps: val };
    await upsertSleepRecord({ ...updated });
    setSleep(updated);
    setStepsEdit(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res  = await fetch('/api/sync');
      const data = await res.json();
      if (!res.ok) { alert(`Erreur sync: ${data.error}`); return; }
      const { upsertSleepRecord: upsert } = await import('@/lib/db');
      for (const r of data.sleep ?? []) await upsert({ ...r, imported_at: new Date().toISOString() });
      await loadData();
    } finally { setSyncing(false); }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen gap-3" style={{ background: '#0a0908' }}>
        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: '#7a6e6a' }}>Initialisation…</span>
      </div>
    );
  }

  const score    = sleep?.sleep_score    ?? 0;
  const deepMin  = sleep?.deep_sleep_min ?? 0;
  const remMin   = sleep?.rem_sleep_min  ?? 0;
  const durMin   = sleep?.duration_min   ?? 0;
  const awakeMin = sleep?.awake_min      ?? 0;
  const hrAvg    = sleep?.hr_avg         ?? 0;
  const lightMin = Math.max(0, durMin - deepMin - remMin - awakeMin);
  const deepPct  = pct(deepMin, durMin);
  const remPct   = pct(remMin,  durMin);
  const lightPct = pct(lightMin, durMin);
  const awakePct = pct(awakeMin, durMin);
  const bars     = sleep ? buildArchitectBars(sleep.sleep_stages_json, deepMin, lightMin, remMin, awakeMin) : [];
  const dateStr  = sleep?.date ? fmtDate(sleep.date) : 'Aucune donnée';

  return (
    <div style={{ background: '#0a0908', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", sans-serif', color: '#f0ebe6', position: 'relative' }}>

      {/* Fixed orbs */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Orb color="#ff6b35" size={420} top={-140} left={-100} opacity={0.60} />
        <Orb color="#cc3300" size={300} top={220}  left={230}  opacity={0.45} />
        <Orb color="#ffb040" size={340} top={560}  left={-120} opacity={0.38} />
        <Orb color="#ff9955" size={260} top={760}  left={220}  opacity={0.35} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, mixBlendMode: 'overlay', backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")" }} />
      </div>

      {/* Floating score pill */}
      <div style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: 16, right: 16, zIndex: 30,
        height: 64, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 12px 0 10px',
        opacity: heroVisible ? 0 : 1,
        transform: heroVisible ? 'translateY(-8px) scale(0.96)' : 'translateY(0) scale(1)',
        pointerEvents: heroVisible ? 'none' : 'auto',
        transition: 'opacity 0.32s ease, transform 0.32s cubic-bezier(0.34,1.56,0.64,1)',
        ...glass(999, 0.14, 0.22),
      }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(#ff6b35 ${score * 36}deg, rgba(255,255,255,0.08) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(255,107,53,0.55)' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#15100c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#ffb040', letterSpacing: -0.5 }}>{score}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#ff6b35', textTransform: 'uppercase' }}>Nightly</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.35)' }} />
            <span style={{ fontSize: 12.5, color: '#fff8f0', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateStr}</span>
          </div>
          {trend && (
            <div style={{ fontSize: 11, fontWeight: 700, color: trend.score >= 0 ? '#7ee2a8' : '#e89383', marginTop: 3 }}>
              {trend.score >= 0 ? '▲' : '▼'} {Math.abs(Math.round(trend.score))} pts vs semaine préc.
            </div>
          )}
        </div>
      </div>

      {/* Page content */}
      <div style={{ position: 'relative', zIndex: 1 }} className="px-4 pt-3 pb-32 max-w-lg mx-auto">

        {/* Header */}
        <header className="flex items-center justify-between mb-5 pt-2">
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#ff6b35', textTransform: 'uppercase', textShadow: '0 0 12px rgba(255,107,53,0.4)' }}>Sleepy</span>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.32)', color: '#ff6b35', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', opacity: syncing ? 0.5 : 1 }}>
            {syncing
              ? <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
              : '↓'}
            {syncing ? 'Sync…' : 'Import'}
          </button>
        </header>

        {sleep ? (
          <>
            {/* Hero card */}
            <div ref={heroRef} style={{ padding: '16px 18px 18px', marginBottom: 12, ...glass(26, 0.10, 0.14) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 8px', borderRadius: 999, background: 'rgba(255,107,53,0.14)', border: '1px solid rgba(255,107,53,0.32)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6b35', boxShadow: '0 0 8px #ff6b35' }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: '#ff6b35', textTransform: 'uppercase' }}>Nightly Genesis</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); navigateDay(-1); }}
                    disabled={currentIdx <= 0}
                    style={{ width: 24, height: 24, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: currentIdx <= 0 ? 'transparent' : 'rgba(255,255,255,0.08)', color: currentIdx <= 0 ? 'rgba(240,235,230,0.2)' : 'rgba(240,235,230,0.7)', fontSize: 13, cursor: currentIdx <= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label="Jour précédent"
                  >‹</button>
                  <span style={{ fontSize: 10, color: 'rgba(240,235,230,0.55)', fontFamily: 'ui-monospace, Menlo, monospace', minWidth: 80, textAlign: 'center' }}>{dateStr}</span>
                  <button
                    onClick={e => { e.stopPropagation(); navigateDay(1); }}
                    disabled={currentIdx >= allRecords.length - 1}
                    style={{ width: 24, height: 24, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: currentIdx >= allRecords.length - 1 ? 'transparent' : 'rgba(255,255,255,0.08)', color: currentIdx >= allRecords.length - 1 ? 'rgba(240,235,230,0.2)' : 'rgba(240,235,230,0.7)', fontSize: 13, cursor: currentIdx >= allRecords.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label="Jour suivant"
                  >›</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ScoreRing score={score} size={124} stroke={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {loadingAi ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
                      <span style={{ fontSize: 12, color: 'rgba(240,235,230,0.5)' }}>Analyse en cours…</span>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13.5, lineHeight: 1.45, color: '#f8f3ee', fontWeight: 400, letterSpacing: -0.1, margin: 0 }}>
                      <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 17 }}>{'« '}</span>
                      {aiComment || 'Bonne nuit de récupération — données analysées.'}
                      <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 17 }}>{' »'}</span>
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <DTrend label="Score" delta={trend ? `${trend.score >= 0 ? '+' : ''}${Math.round(trend.score)} pts` : '—'} up={!trend || trend.score >= 0} />
                <DTrend label="Durée" delta={trend ? `${trend.dur >= 0 ? '+' : ''}${Math.round(trend.dur)} min` : '—'} up={!trend || trend.dur >= 0} />
                <DTrend label="FC"    delta={hrAvg > 0 ? `${hrAvg} bpm` : '—'} up />
              </div>
            </div>

            {/* HR + Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ padding: '12px 14px', ...glass(18, 0.07) }}>
                <SLabel>Fréquence Cardiaque</SLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,235,230,0.55)' }}>{hrAvg > 5 ? hrAvg - 8 : '—'}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'linear-gradient(90deg, rgba(255,107,53,0.2), #ff6b35)', boxShadow: '0 0 8px rgba(255,107,53,0.4)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#ff6b35' }}>{hrAvg > 0 ? hrAvg + 12 : '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#f8f3ee', letterSpacing: -1 }}>{hrAvg > 0 ? hrAvg : '—'}</span>
                  <span style={{ fontSize: 11, color: 'rgba(240,235,230,0.5)' }}>bpm moy.</span>
                </div>
              </div>
              <div style={{ padding: '12px 14px', ...glass(18, 0.07) }}>
                <SLabel>Durée Totale</SLabel>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#f8f3ee', letterSpacing: -1 }}>{fmtDur(durMin)}</span>
                </div>
                <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: durMin >= 420 ? '#4caf78' : '#ffb040' }}>
                  {durMin >= 480 ? '+Objectif' : durMin >= 420 ? '≈ Objectif' : '− Objectif'}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(240,235,230,0.4)' }}>
                  <span>🌙 {sleep.sleep_start}</span><span>→</span><span>☀ {sleep.sleep_end}</span>
                </div>
              </div>
            </div>

            {/* Sleep Architect */}
            <div
              onClick={() => setExpanded(e => e === 'architect' ? null : 'architect')}
              style={{ padding: '14px 16px 16px', cursor: 'pointer', marginBottom: 12, ...glass(22, 0.09, 0.12) }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <SLabel>Sleep Architect</SLabel>
                <span style={{ fontSize: 10, color: 'rgba(240,235,230,0.35)' }}>{expanded === 'architect' ? '– réduire' : '+ détails'}</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(240,235,230,0.7)', marginBottom: 12 }}>Cycles biologiques de la nuit</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {[{ l: 'Profond', c: '#7a1500' }, { l: 'Léger', c: '#cc3300' }, { l: 'REM', c: '#ff9955' }, { l: 'Éveils', c: '#ffd040' }].map(({ l, c }) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(240,235,230,0.55)', textTransform: 'uppercase' }}>{l}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 78, padding: '0 2px' }}>
                {bars.map((b, i) => (
                  <div key={i} style={{ flex: b.flex, minWidth: 2, height: `${b.height}%`, background: `linear-gradient(180deg, ${b.color}ee, ${b.color}99)`, borderRadius: 2, boxShadow: `0 0 5px ${b.color}55`, transition: 'height 0.3s ease' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(240,235,230,0.35)', textTransform: 'uppercase', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                <span>{sleep.sleep_start || '22:00'}</span><span>03:00</span><span>{sleep.sleep_end || '06:00'}</span>
              </div>
              {expanded === 'architect' && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Phase color="#7a1500" label="Profond"  dur={fmtDur(deepMin)}  pct={`${deepPct} %`}  note="Objectif >20%" />
                  <Phase color="#cc3300" label="Léger"    dur={fmtDur(lightMin)} pct={`${lightPct} %`} note="Dans la norme" />
                  <Phase color="#ff9955" label="REM"      dur={fmtDur(remMin)}   pct={`${remPct} %`}   note="Cible ~20%" />
                  <Phase color="#ffd040" label="Éveillé"  dur={fmtDur(awakeMin)} pct={`${awakePct} %`} note="Objectif <5%" />
                </div>
              )}
            </div>

            {/* AI Insight */}
            <div
              onClick={() => setExpanded(e => e === 'observation' ? null : 'observation')}
              style={{ padding: '14px 16px', cursor: 'pointer', marginBottom: 12, ...glass(22, 0.08, 0.14) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 8px', borderRadius: 999, background: 'rgba(255,107,53,0.14)', border: '1px solid rgba(255,107,53,0.32)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6b35', boxShadow: '0 0 8px #ff6b35' }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: '#ff6b35', textTransform: 'uppercase' }}>AI Insight</span>
                </div>
                <span style={{ fontSize: 10, color: 'rgba(240,235,230,0.4)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {expanded === 'observation' ? '– réduire' : '+ détails'}
                </span>
              </div>
              {loadingAi ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
                  <span style={{ fontSize: 13, color: 'rgba(240,235,230,0.5)' }}>Analyse en cours…</span>
                </div>
              ) : (
                <p style={{ fontSize: 14, lineHeight: 1.5, color: '#f8f3ee', fontWeight: 400, letterSpacing: -0.05, margin: 0 }}>
                  <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 17 }}>{'« '}</span>
                  {aiComment || "Lance un import pour obtenir une analyse personnalisée."}
                  <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 17 }}>{' »'}</span>
                </p>
              )}
              {expanded === 'observation' && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'rgba(240,235,230,0.75)', lineHeight: 1.5 }}>
                  <div>• Deep sleep : <strong style={{ color: '#cc3300' }}>{fmtDur(deepMin)}</strong> ({deepPct}%){deepPct >= 20 ? ' — objectif atteint ✓' : ' — objectif >20%'}.</div>
                  <div>• REM : <strong style={{ color: '#ffb040' }}>{fmtDur(remMin)}</strong> ({remPct}%){remPct >= 18 ? ' — dans la cible.' : ' — cible ~20%.'}.</div>
                  <div>• Éveils : <strong style={{ color: '#ff9955' }}>{fmtDur(awakeMin)}</strong> ({awakePct}%){awakePct <= 5 ? ' — très bien.' : ' — un peu élevé.'}.</div>
                  {hrAvg > 0 && <div>• FC moy. <strong style={{ color: '#e05a4a' }}>{hrAvg} bpm</strong> — fréquence de récupération.</div>}
                </div>
              )}
            </div>

            {/* Metrics grid */}
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(240,235,230,0.4)', textTransform: 'uppercase', padding: '6px 2px 8px' }}>Métriques détaillées</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <Metric label="Deep"    value={`${deepPct}`}  unit="%"   color="#cc3300" />
              <Metric label="REM"     value={`${remPct}`}   unit="%"   color="#ffb040" />
              <Metric label="Éveil"   value={fmtDur(awakeMin)}          color="#ff6b35" />
              <Metric label="FC moy." value={hrAvg > 0 ? `${hrAvg}` : '—'} unit="bpm" color="#e05a4a" />
              <Metric label="Pas"     value={(sleep.steps ?? 0).toLocaleString('fr-FR')} color="#4caf78" onClick={openStepsEdit} />
              <Metric label="Couché"  value={sleep.sleep_start ?? '—'}  color="#ff9955" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-20 text-center">
            <div style={{ width: 64, height: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 20, ...glass(20, 0.08) }}>🌙</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(240,235,230,0.5)', margin: 0 }}>
              Aucune donnée de sommeil.<br />Appuie sur Import pour commencer.
            </p>
          </div>
        )}

        {/* Lifestyle CTA */}
        <div
          onClick={() => setFormOpen(true)}
          style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', ...glass(20, 0.06, 0.10) }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, fontSize: 16, background: lifestyle ? 'rgba(76,175,120,0.15)' : 'rgba(255,107,53,0.15)', border: `1px solid ${lifestyle ? 'rgba(76,175,120,0.3)' : 'rgba(255,107,53,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: lifestyle ? '#4caf78' : '#ff6b35' }}>
            {lifestyle ? '✓' : '✎'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f8f3ee' }}>
              {lifestyle ? 'Log lifestyle enregistré' : 'Remplis le log du soir'}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(240,235,230,0.5)', marginTop: 2 }}>
              {lifestyle ? 'Appuie pour modifier' : 'Caféine · sport · repas · écrans — < 30 s'}
            </div>
          </div>
          <span style={{ color: 'rgba(240,235,230,0.3)', fontSize: 16 }}>›</span>
        </div>
      </div>

      {/* Steps edit modal */}
      {stepsEdit && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={() => setStepsEdit(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 p-6 max-w-xs mx-auto" style={{ ...glass(24, 0.12, 0.18) }}>
            <p style={{ fontWeight: 800, fontSize: 16, color: '#f8f3ee', marginBottom: 4, marginTop: 0 }}>Nombre de pas</p>
            <p style={{ fontSize: 12, color: 'rgba(240,235,230,0.5)', marginBottom: 16, marginTop: 0 }}>Modifie le nombre de pas</p>
            <input
              type="number" min="0"
              value={stepsInput}
              onChange={e => setStepsInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveSteps()}
              autoFocus
              style={{ width: '100%', borderRadius: 14, padding: '12px 16px', fontSize: 18, fontWeight: 800, textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#f8f3ee', outline: 'none', boxSizing: 'border-box', marginBottom: 16, display: 'block' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStepsEdit(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(240,235,230,0.6)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
              <button onClick={saveSteps} style={{ flex: 1, padding: '10px 0', borderRadius: 14, border: 'none', background: '#ff6b35', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14, boxShadow: '0 0 16px rgba(255,107,53,0.4)' }}>Enregistrer</button>
            </div>
          </div>
        </>
      )}

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

function Orb({ color, size, top, left, opacity }: { color: string; size: number; top: number; left: number; opacity: number }) {
  return <div style={{ position: 'absolute', top, left, width: size, height: size, borderRadius: '50%', background: color, opacity, filter: 'blur(80px)' }} />;
}

function ScoreRing({ score, size = 140, stroke = 9 }: { score: number; size?: number; stroke?: number }) {
  const cx = size / 2, cy = size / 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arcLen = c * 0.75;
  const progress = (score / 100) * arcLen;
  const arcColor = score >= 80 ? '#ff6b35' : score >= 60 ? '#ff8c00' : score >= 40 ? '#ffb040' : '#e05a4a';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="sgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={arcColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={arcColor} stopOpacity={1} />
          </linearGradient>
          <filter id="sgGlow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}
          strokeDasharray={`${arcLen} ${c - arcLen}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcColor} strokeOpacity="0.35" strokeWidth={stroke}
          strokeDasharray={`${progress} ${c - progress}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`} filter="url(#sgGlow)" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#sgGrad)" strokeWidth={stroke}
          strokeDasharray={`${progress} ${c - progress}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, paddingBottom: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: arcColor, letterSpacing: -2, lineHeight: 1, textShadow: `0 0 16px ${arcColor}80` }}>
            {(score / 10).toFixed(1)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: arcColor, opacity: 0.6 }}>/10</span>
        </div>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(240,235,230,0.55)', textTransform: 'uppercase', marginTop: 4 }}>Score</span>
      </div>
    </div>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(240,235,230,0.55)', textTransform: 'uppercase' }}>{children}</span>;
}

function DTrend({ label, delta, up }: { label: string; delta: string; up: boolean }) {
  const color = up ? '#4caf78' : '#e89383';
  return (
    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 12, background: up ? 'rgba(76,175,120,0.08)' : 'rgba(232,147,131,0.08)', border: `1px solid ${up ? 'rgba(76,175,120,0.22)' : 'rgba(232,147,131,0.22)'}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color, letterSpacing: -0.2 }}>{delta}</div>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(240,235,230,0.4)', textTransform: 'uppercase', marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Phase({ color, label, dur, pct, note }: { color: string; label: string; dur: string; pct: string; note: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(240,235,230,0.55)', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#f8f3ee', letterSpacing: -0.5 }}>{dur}</span>
        <span style={{ fontSize: 10.5, color, fontWeight: 700 }}>{pct}</span>
      </div>
      <div style={{ fontSize: 9.5, color: 'rgba(240,235,230,0.4)', marginTop: 2 }}>{note}</div>
    </div>
  );
}

function Metric({ label, value, unit, color, onClick }: { label: string; value: string; unit?: string; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '10px 12px', borderRadius: 14, cursor: onClick ? 'pointer' : 'default', background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(240,235,230,0.5)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 5 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: -0.6 }}>{value}</span>
        {unit && <span style={{ fontSize: 10, color, opacity: 0.6 }}>{unit}</span>}
      </div>
    </div>
  );
}
