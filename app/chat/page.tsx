'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';
import { Bot, MoreHorizontal, ArrowUp, Moon, BarChart2, Coffee, Zap, Calendar, ChevronRight } from 'lucide-react';
import { getSleepRecords, getLifestyleLogs } from '@/lib/db';
import { buildSleepContext, streamChatResponse } from '@/lib/claude-client';
import MarkdownContent from '@/components/MarkdownContent';
import type { ChatMessage, SleepRecord } from '@/lib/types';

const SUGGESTIONS = [
  { q: "Pourquoi j'ai mal dormi cette semaine ?",    Icon: Moon,       accent: '#ff6b35' },
  { q: "Quel est mon meilleur pattern de sommeil ?", Icon: BarChart2,  accent: '#ffb040' },
  { q: "La caféine impacte-t-elle mon deep sleep ?", Icon: Coffee,     accent: '#cc3300' },
  { q: "Est-ce que le sport le soir me nuit ?",      Icon: Zap,        accent: '#ff9955' },
  { q: "Quels jours ai-je le mieux dormi ce mois ?", Icon: Calendar,   accent: '#ff9955' },
];

let _id = 0;
const nextId = () => String(++_id);

function glass(tint = 0.08, border = 0.12, radius = 20): CSSProperties {
  return {
    background: `rgba(255,255,255,${tint})`,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: `1px solid rgba(255,255,255,${border})`,
    borderRadius: radius,
    boxShadow: [
      '0 1px 0 rgba(255,255,255,0.06) inset',
      '0 -1px 0 rgba(0,0,0,0.1) inset',
      '0 8px 24px rgba(0,0,0,0.35)',
    ].join(', '),
  };
}

interface SleepStats {
  avgScore: number;
  avgDeep: number;
  avgDuration: string;
  avgHR: number;
}

function computeStats(records: SleepRecord[]): SleepStats | null {
  const r7 = records.slice(0, 7);
  if (r7.length === 0) return null;
  const avgScore   = Math.round(r7.reduce((a, r) => a + r.sleep_score,   0) / r7.length);
  const avgDeepMin = r7.reduce((a, r) => a + r.deep_sleep_min, 0) / r7.length;
  const avgDurMin  = r7.reduce((a, r) => a + r.duration_min,   0) / r7.length;
  const avgDeepPct = Math.round((avgDeepMin / avgDurMin) * 100);
  const h = Math.floor(avgDurMin / 60);
  const m = Math.round(avgDurMin % 60);
  const avgHR      = Math.round(r7.reduce((a, r) => a + r.hr_avg,        0) / r7.length);
  return { avgScore, avgDeep: avgDeepPct, avgDuration: `${h}h${String(m).padStart(2, '0')}`, avgHR };
}

export default function ChatPage() {
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [input,        setInput]        = useState('');
  const [streaming,    setStreaming]    = useState(false);
  const [context,      setContext]      = useState('');
  const [contextReady, setContextReady] = useState(false);
  const [nightCount,   setNightCount]   = useState(0);
  const [stats,        setStats]        = useState<SleepStats | null>(null);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const [sr, ll] = await Promise.all([getSleepRecords(365), getLifestyleLogs(365)]);
      setContext(buildSleepContext(sr, ll));
      setNightCount(sr.length);
      setContextReady(true);
      setStats(computeStats(sr));
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !contextReady) return;
    setInput('');

    const userMsg: ChatMessage = { id: nextId(), role: 'user',      content: trimmed, timestamp: Date.now() };
    const asstId = nextId();
    const asstMsg: ChatMessage = { id: asstId,  role: 'assistant', content: '',      timestamp: Date.now() };

    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, asstMsg]);
    setStreaming(true);

    try {
      await streamChatResponse(
        [...newHistory, { id: 'q', role: 'user' as const, content: trimmed, timestamp: Date.now() }],
        context,
        chunk => setMessages(prev =>
          prev.map(m => m.id === asstId ? { ...m, content: m.content + chunk } : m)
        ),
        () => setStreaming(false),
      );
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === asstId
          ? { ...m, content: 'Erreur : impossible de contacter le coach IA.' }
          : m)
      );
      setStreaming(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    // Outer shell: full height, clips orbs, no own scroll
    <div
      className="relative h-full flex flex-col overflow-hidden"
      style={{ background: '#0a0908', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", sans-serif' }}>

      {/* ── Background orbs — absolute, clipped by overflow-hidden ──── */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: -80,  width: 380, height: 380, borderRadius: '50%', background: '#ff6b35', opacity: 0.55, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', top: 180,  left: '55%',width: 260, height: 260, borderRadius: '50%', background: '#cc3300', opacity: 0.45, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', top: 480,  left: -120, width: 320, height: 320, borderRadius: '50%', background: '#ffb040', opacity: 0.40, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', top: 650,  left: '55%',width: 240, height: 240, borderRadius: '50%', background: '#ff9955', opacity: 0.35, filter: 'blur(80px)' }} />
      </div>

      {/* ── Top glass bar ───────────────────────────────────────────── */}
      <div className="relative shrink-0 px-4 pt-2 pb-1.5" style={{ zIndex: 10 }}>
        <div style={{ ...glass(0.08, 0.14, 22), padding: '10px 12px 10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #ff6b35, #cc3300)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(255,107,53,0.5), inset 0 1px 0 rgba(255,220,180,0.5)',
            color: '#fff',
          }}><Bot size={16} strokeWidth={2} /></div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: '#ff6b35', textTransform: 'uppercase' }}>
              Sleepy · Coach
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(240,235,230,0.65)', marginTop: 1 }}>
              {contextReady ? `${nightCount} nuits analysées · prêt` : 'Chargement du contexte…'}
            </div>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(240,235,230,0.5)',
          }}><MoreHorizontal size={18} strokeWidth={1.8} /></div>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ position: 'relative', zIndex: 5 }}>
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">

          {/* Hero editorial glass card */}
          <div
            role="button"
            onClick={() => setHeroExpanded(e => !e)}
            style={{ ...glass(0.10, 0.14, 26), padding: '16px 18px 18px', cursor: 'pointer' }}>

            {/* Live badge + model */}
            <div className="flex items-center justify-between mb-3">
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 9px 3px 8px', borderRadius: 999,
                background: 'rgba(255,107,53,0.14)',
                border: '1px solid rgba(255,107,53,0.32)',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6b35', boxShadow: '0 0 8px #ff6b35', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', color: '#ff6b35', textTransform: 'uppercase' }}>En direct</span>
              </div>
              <span style={{ fontSize: 10, color: 'rgba(240,235,230,0.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                Sonnet 4.6 · {nightCount} j
              </span>
            </div>

            {/* Pull-quote */}
            <p style={{ fontSize: 16, lineHeight: 1.5, color: '#f8f3ee', fontWeight: 400, letterSpacing: -0.1 }}>
              <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 19 }}>« </span>
              Ta semaine est marquée par trois nuits courtes —{' '}
              <strong style={{ color: '#ffb040', fontWeight: 600 }}>corrélées à ta caféine après 15h</strong>
              . Pose-moi une question, on creuse.
              <span style={{ fontFamily: 'ui-serif, "New York", Georgia, serif', fontStyle: 'italic', color: '#ffb040', fontSize: 19 }}> »</span>
            </p>

            {/* Toggle hint */}
            <div className="flex items-center justify-between mt-2.5">
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(240,235,230,0.35)', textTransform: 'uppercase' }}>
                Briefing du jour
              </span>
              <span style={{ fontSize: 10, color: 'rgba(240,235,230,0.35)' }}>
                {heroExpanded ? '− réduire' : '+ détails'}
              </span>
            </div>

            {/* Expanded stats */}
            {heroExpanded && (
              <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <StatCard label="Score moy. 7j" value={stats ? String(stats.avgScore) : '—'} unit="/100" />
                <StatCard label="Deep sleep"    value={stats ? String(stats.avgDeep)  : '—'} unit="%" />
                <StatCard label="Durée moy."    value={stats ? stats.avgDuration      : '—'} />
                <StatCard label="FC nocturne"   value={stats ? String(stats.avgHR)    : '—'} unit="bpm" />
              </div>
            )}
          </div>

          {/* ── Suggestions ─────────────────────────────────────────── */}
          {!hasMessages && (
            <>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(240,235,230,0.4)', textTransform: 'uppercase', padding: '6px 4px 2px' }}>
                Questions fréquentes
              </p>
              <div className="flex flex-col gap-2.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.q}
                    onClick={() => send(s.q)}
                    disabled={!contextReady}
                    className="flex items-center gap-3 text-left w-full disabled:opacity-40"
                    style={{ ...glass(0.05, 0.08, 18), padding: '12px 14px', border: 'none', cursor: contextReady ? 'pointer' : 'default' }}>
                    <div                     style={{
                      width: 34, height: 34, borderRadius: 11, flexShrink: 0,
                      background: `${s.accent}22`,
                      border: `1px solid ${s.accent}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: s.accent,
                    }}><s.Icon size={16} strokeWidth={2} /></div>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: '#f0ebe6', lineHeight: 1.35 }}>
                      {s.q}
                    </span>
                    <ChevronRight size={14} strokeWidth={2} style={{ color: 'rgba(240,235,230,0.3)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Messages ────────────────────────────────────────────── */}
          {hasMessages && (
            <div className="flex flex-col gap-2.5">
              {messages.map(m => <AuroraBubble key={m.id} msg={m} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Glass composer ──────────────────────────────────────────── */}
      <div className="relative shrink-0 px-4 pb-3 pt-2" style={{ zIndex: 10 }}>
        <div style={{ ...glass(0.12, 0.18, 28), padding: '6px 6px 6px 16px', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent outline-none resize-none"
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={contextReady ? 'Pose une question sur ton sommeil…' : 'Chargement…'}
            disabled={!contextReady}
            style={{ fontSize: 14, color: '#f0ebe6', padding: '10px 0', fontFamily: 'inherit', maxHeight: 112 }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming || !contextReady}
            className="shrink-0 flex items-center justify-center disabled:opacity-40 transition-all"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', marginBottom: 2,
              background: 'linear-gradient(135deg, #ff8c00, #cc3300)',
              color: '#fff',
              boxShadow: '0 6px 18px rgba(255,107,53,0.55), inset 0 1px 0 rgba(255,220,180,0.5)',
            }}>
            {streaming
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <ArrowUp size={18} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(240,235,230,0.5)', textTransform: 'uppercase' }}>
        {label}
      </p>
      <div className="flex items-baseline gap-1 mt-1">
        <span style={{ fontSize: 20, fontWeight: 800, color: '#f8f3ee', letterSpacing: -0.8 }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: 'rgba(240,235,230,0.4)' }}>{unit}</span>}
      </div>
    </div>
  );
}

function AuroraBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div style={{
          maxWidth: '80%', padding: '10px 14px',
          borderRadius: '22px 22px 6px 22px',
          background: 'linear-gradient(135deg, #ff8c00, #cc3300)',
          color: '#fff', fontSize: 13.5, lineHeight: 1.4, fontWeight: 500,
          boxShadow: '0 6px 16px rgba(204,51,0,0.4), inset 0 1px 0 rgba(255,220,180,0.35)',
        }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div style={{
        maxWidth: '88%', padding: '12px 14px',
        borderRadius: '6px 22px 22px 22px',
        fontSize: 13, lineHeight: 1.5, color: '#f0ebe6',
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px rgba(0,0,0,0.35)',
      }}>
        {msg.content ? (
          <MarkdownContent content={msg.content} compact />
        ) : (
          <span className="inline-block w-1 h-4 rounded animate-pulse" style={{ background: '#ff6b35' }} />
        )}
      </div>
    </div>
  );
}
