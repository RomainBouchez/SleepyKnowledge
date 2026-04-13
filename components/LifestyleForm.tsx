'use client';

import { useEffect, useState } from 'react';
import type { LifestyleLog, MealHeaviness } from '@/lib/types';
import { todayStr } from '@/lib/db';

interface Props {
  visible: boolean;
  initial: LifestyleLog | null;
  todaySteps: number;
  onSave: (log: Omit<LifestyleLog, 'id'>) => Promise<void>;
  onClose: () => void;
}

function defaultForm(): Omit<LifestyleLog, 'id'> {
  return {
    date: todayStr(),
    caffeine_mg: 200,
    caffeine_last_hour: '14:00',
    sport_type: 'none',
    sport_intensity: 5,
    sport_hour: '18:00',
    screen_last_hour: '22:00',
    meal_hour: '20:00',
    meal_heaviness: 'normal',
    weed: false,
    weed_hour: '',
    notes: '',
  };
}

const SPORT_OPTS = [
  { val: 'none', label: 'Aucun' },
  { val: 'running', label: '🏃 Running' },
  { val: 'weights', label: '🏋️ Muscu' },
  { val: 'cycling', label: '🚴 Vélo' },
  { val: 'yoga', label: '🧘 Yoga' },
  { val: 'autre', label: '⚡ Autre' },
];

const MEAL_OPTS: MealHeaviness[] = ['léger', 'normal', 'lourd'];

export default function LifestyleForm({ visible, initial, todaySteps, onSave, onClose }: Props) {
  const [form, setForm] = useState<Omit<LifestyleLog, 'id'>>(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setForm(initial ?? defaultForm());
  }, [visible, initial]);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(p => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-sl-bg flex flex-col safe-top">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sl-border shrink-0">
        <button onClick={onClose} className="text-sl-gray text-sm py-1 px-2">Annuler</button>
        <span className="text-sl-white font-semibold">Soirée du {form.date}</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-sl-blue text-white text-sm font-semibold px-3 py-1.5 rounded-lg min-w-[80px] text-center disabled:opacity-50">
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* ── Caféine ─────────────────────────────────────── */}
        <Section title="☕  Caféine">
          <Row label={`Quantité : ${form.caffeine_mg} mg`}>
            <input type="range" min={0} max={600} step={25}
              value={form.caffeine_mg}
              onChange={e => set('caffeine_mg', +e.target.value)}
              className="w-full mt-2" />
          </Row>
          <Row label="Dernière prise">
            <input type="time" value={form.caffeine_last_hour}
              onChange={e => set('caffeine_last_hour', e.target.value)} />
          </Row>
        </Section>

        {/* ── Sport ───────────────────────────────────────── */}
        <Section title="🏋️  Sport">
          <div className="flex flex-wrap gap-2 mt-1">
            {SPORT_OPTS.map(o => (
              <button key={o.val}
                className={`pill ${form.sport_type === o.val ? 'active' : ''}`}
                onClick={() => set('sport_type', o.val)}>
                {o.label}
              </button>
            ))}
          </div>
          {form.sport_type !== 'none' && (
            <>
              <Row label={`Intensité : ${form.sport_intensity}/10`}>
                <input type="range" min={1} max={10} step={1} className="w-full mt-2 violet"
                  value={form.sport_intensity}
                  onChange={e => set('sport_intensity', +e.target.value)} />
              </Row>
              <Row label="Heure">
                <input type="time" value={form.sport_hour}
                  onChange={e => set('sport_hour', e.target.value)} />
              </Row>
            </>
          )}
        </Section>

        {/* ── Écrans ──────────────────────────────────────── */}
        <Section title="📱  Écrans">
          <Row label="Dernier écran">
            <input type="time" value={form.screen_last_hour}
              onChange={e => set('screen_last_hour', e.target.value)} />
          </Row>
        </Section>

        {/* ── Repas ───────────────────────────────────────── */}
        <Section title="🍽️  Repas du soir">
          <div className="flex gap-2 mt-1">
            {MEAL_OPTS.map(o => (
              <button key={o}
                className={`pill ${form.meal_heaviness === o ? 'active' : ''}`}
                onClick={() => set('meal_heaviness', o)}>
                {o}
              </button>
            ))}
          </div>
          <Row label="Heure du repas">
            <input type="time" value={form.meal_hour}
              onChange={e => set('meal_hour', e.target.value)} />
          </Row>
        </Section>

        {/* ── Weed ────────────────────────────────────────── */}
        <Section title="🌿  Cannabis">
          <Row label="Ce soir">
            <label className="toggle">
              <input type="checkbox" checked={form.weed} onChange={e => set('weed', e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </Row>
          {form.weed && (
            <Row label="Heure">
              <input type="time" value={form.weed_hour}
                onChange={e => set('weed_hour', e.target.value)} />
            </Row>
          )}
        </Section>

        {/* ── Pas ─────────────────────────────────────────── */}
        <Section title="👟  Pas du jour">
          <p className="text-2xl font-bold text-sl-green mt-1">
            {todaySteps.toLocaleString('fr-FR')} pas
          </p>
          <p className="text-xs text-sl-muted mt-0.5">Importé depuis la montre</p>
        </Section>

        {/* ── Notes ───────────────────────────────────────── */}
        <Section title="📝  Notes">
          <textarea
            className="w-full mt-1 bg-transparent text-sl-white text-sm resize-none outline-none placeholder-sl-muted"
            rows={3}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Stressé, voyage, soirée tardive…"
          />
        </Section>

        <div className="h-8" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-sl-gray">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-sl-gray">{label}</span>
      {children}
    </div>
  );
}
