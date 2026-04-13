'use client';

import { useEffect, useState } from 'react';
import {
  getSleepRecords, getLifestyleLogs,
  getLatestWeeklyReports, getAiInsight, saveAiInsight,
} from '@/lib/db';
import { fetchWeeklyReport } from '@/lib/claude-client';
import { currentWeekStart, isMonday } from '@/lib/sync';
import type { AiInsight } from '@/lib/types';

// ── Markdown-lite renderer ────────────────────────────────────────────────────

function ReportContent({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;

        // Heading: ## or **...**
        if (t.startsWith('## ') || (t.startsWith('**') && t.endsWith('**'))) {
          const content = t.replace(/^##\s*/, '').replace(/^\*\*|\*\*$/g, '');
          return <p key={i} className="text-sl-white font-bold text-sm mt-3">{content}</p>;
        }
        // Numbered list
        const numM = t.match(/^(\d+)\.\s+(.+)/);
        if (numM) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-sl-violet text-sm font-bold shrink-0">{numM[1]}.</span>
              <p className="text-sl-white text-sm leading-relaxed">{inlineBold(numM[2])}</p>
            </div>
          );
        }
        // Bullet
        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-sl-violet text-sm shrink-0">•</span>
              <p className="text-sl-white text-sm leading-relaxed">{inlineBold(t.slice(2))}</p>
            </div>
          );
        }
        return <p key={i} className="text-sl-white text-sm leading-relaxed">{inlineBold(t)}</p>;
      })}
    </div>
  );
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="font-bold">{p}</strong> : p
  );
}

function weekLabel(weekStart: string) {
  const s = new Date(weekStart + 'T12:00:00');
  const e = new Date(weekStart + 'T12:00:00');
  e.setDate(s.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  return `${s.toLocaleDateString('fr-FR', o)} — ${e.toLocaleDateString('fr-FR', o)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [reports,    setReports]   = useState<AiInsight[]>([]);
  const [generating, setGenerating]= useState(false);
  const [ready,      setReady]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setReady(false);
    const saved = await getLatestWeeklyReports(4);
    setReports(saved);

    // Auto-generate on Mondays
    if (isMonday()) {
      const ws = currentWeekStart();
      const existing = await getAiInsight(ws, 'weekly_report');
      if (!existing) await generate(ws, false);
    }
    setReady(true);
  }

  async function generate(weekStart?: string, showAlert = true) {
    setGenerating(true);
    const ws = weekStart ?? currentWeekStart();
    try {
      const [sr, ll] = await Promise.all([getSleepRecords(7), getLifestyleLogs(7)]);
      if (sr.length < 3) {
        if (showAlert) alert('Pas assez de données (minimum 3 nuits requises).');
        return;
      }
      const content = await fetchWeeklyReport(sr, ll);
      await saveAiInsight({ date: ws, type: 'weekly_report', content, generated_at: new Date().toISOString() });
      const fresh = await getLatestWeeklyReports(4);
      setReports(fresh);
    } catch (err) {
      if (showAlert) alert(`Erreur : ${err instanceof Error ? err.message : 'Génération impossible.'}`);
    } finally {
      setGenerating(false);
      setReady(true);
    }
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-lg mx-auto">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-sl-white">Rapport hebdo 📋</h1>
          <p className="text-[11px] text-sl-muted mt-0.5">
            {isMonday() ? 'Auto-généré chaque lundi' : 'Disponible le lundi matin'}
          </p>
        </div>
        <button
          onClick={() => generate()}
          disabled={generating}
          className="flex items-center gap-2 bg-sl-violet text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
          {generating
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : null}
          {generating ? 'Génération…' : 'Générer'}
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {!ready ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-sl-violet border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">📋</span>
          <p className="text-sl-white font-semibold text-base mb-2">Aucun rapport pour l'instant</p>
          <p className="text-sl-gray text-sm leading-relaxed">
            Les rapports sont générés automatiquement chaque lundi.<br />
            Tu peux aussi en créer un via le bouton "Générer".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((r, i) => (
            <div key={r.id ?? i} className="card" style={{ borderColor: i === 0 ? '#8B5CF644' : '#1E293B' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sl-white font-bold text-sm flex-1">
                  Semaine du {weekLabel(r.date)}
                </p>
                {i === 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0"
                    style={{ background: '#8B5CF622', color: '#8B5CF6', border: '1px solid #8B5CF655' }}>
                    Dernière
                  </span>
                )}
              </div>
              <p className="text-sl-muted text-xs mb-4">
                Généré le {new Date(r.generated_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                })}
              </p>
              <div className="border-t border-sl-border pt-4">
                <ReportContent text={r.content} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
