'use client';

import { useEffect, useRef, useState } from 'react';
import { getSleepRecords, getLifestyleLogs } from '@/lib/db';
import { buildSleepContext, streamChatResponse } from '@/lib/claude-client';
import MarkdownContent from '@/components/MarkdownContent';
import type { ChatMessage } from '@/lib/types';

const SUGGESTIONS = [
  'Pourquoi j\'ai mal dormi cette semaine ?',
  'Quel est mon meilleur pattern de sommeil ?',
  'La caféine impacte-t-elle mon deep sleep ?',
  'Est-ce que le sport le soir me nuit ?',
  'Quels jours ai-je le mieux dormi ce mois ?',
];

let _id = 0;
const nextId = () => String(++_id);

export default function ChatPage() {
  const [messages,      setMessages]     = useState<ChatMessage[]>([]);
  const [input,         setInput]        = useState('');
  const [streaming,     setStreaming]     = useState(false);
  const [context,       setContext]       = useState('');
  const [contextReady,  setContextReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [sr, ll] = await Promise.all([getSleepRecords(30), getLifestyleLogs(30)]);
      setContext(buildSleepContext(sr, ll));
      setContextReady(true);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !contextReady) return;
    setInput('');

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: trimmed, timestamp: Date.now() };
    const asstId = nextId();
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '', timestamp: Date.now() };

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

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-sl-border shrink-0">
        <h1 className="text-xl font-bold text-sl-white">Coach IA 💬</h1>
        <p className="text-[11px] text-sl-muted mt-0.5">
          {contextReady ? '30 jours de données chargées' : 'Chargement du contexte…'}
        </p>
      </div>

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray mb-3">
              Questions fréquentes
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map(s => (
                <button key={s}
                  className="w-full text-left card text-sl-white text-sm disabled:opacity-40"
                  onClick={() => send(s)}
                  disabled={!contextReady}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-t border-sl-border bg-sl-surface flex gap-3 items-end">
        <textarea
          className="flex-1 bg-sl-surface2 rounded-2xl px-4 py-2.5 text-sl-white text-sm resize-none outline-none placeholder-sl-muted max-h-28"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={contextReady ? 'Pose une question sur ton sommeil…' : 'Chargement…'}
          disabled={!contextReady}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming || !contextReady}
          className="w-10 h-10 rounded-full bg-sl-blue flex items-center justify-center shrink-0 disabled:bg-sl-muted transition-colors">
          {streaming
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <span className="text-white font-bold text-lg leading-none">↑</span>}
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const user = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${user ? 'justify-end' : 'justify-start'} items-end`}>
      {!user && <span className="text-2xl shrink-0">🤖</span>}
      <div
        className={`max-w-[80%] px-4 py-2.5 ${user ? 'bubble-user' : 'bubble-assistant'}`}>
        {user ? (
          <p className="text-sm leading-relaxed text-sl-white">{msg.content}</p>
        ) : msg.content ? (
          <MarkdownContent content={msg.content} compact />
        ) : (
          <span className="inline-block w-1 h-4 bg-sl-blue animate-pulse rounded" />
        )}
        <p className="text-[10px] text-sl-muted mt-1 text-right">
          {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
