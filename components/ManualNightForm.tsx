'use client';

import { useEffect, useState } from 'react';
import type { SleepRecord } from '@/lib/types';
import { todayStr } from '@/lib/db';

interface Props {
  visible: boolean;
  onSave: (record: Omit<SleepRecord, 'id'>) => Promise<void>;
  onClose: () => void;
}

function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return endMin - startMin;
}

function defaultForm(): Omit<SleepRecord, 'id'> {
  return {
    date: todayStr(),
    sleep_start: '23:00',
    sleep_end: '07:00',
    duration_min: 480,
    deep_sleep_min: 90,
    light_sleep_min: 240,
    rem_sleep_min: 110,
    awake_min: 20,
    sleep_score: 70,
    hr_avg: 55,
    hr_min: 48,
    hr_max: 75,
    steps: 8000,
    imported_at: new Date().toISOString(),
  };
}

export default function ManualNightForm({ visible, onSave, onClose }: Props) {
  const [form, setForm] = useState<Omit<SleepRecord, 'id'>>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hrUnknown, setHrUnknown] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(defaultForm());
      setError('');
      setHrUnknown(false);
    }
  }, [visible]);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(p => {
      const next = { ...p, [key]: val };
      if (key === 'sleep_start' || key === 'sleep_end') {
        next.duration_min = calcDuration(
          key === 'sleep_start' ? String(val) : p.sleep_start,
          key === 'sleep_end'   ? String(val) : p.sleep_end,
        );
      }
      return next;
    });
  }

  function phaseSum() {
    return form.deep_sleep_min + form.light_sleep_min + form.rem_sleep_min + form.awake_min;
  }

  async function handleSave() {
    setError('');
    if (!form.date) { setError('La date est requise.'); return; }
    if (phaseSum() > form.duration_min + 5) {
      setError(`La somme des phases (${phaseSum()} min) dépasse la durée totale (${form.duration_min} min).`);
      return;
    }
    setSaving(true);
    try {
      const record = { ...form, imported_at: new Date().toISOString() };
      if (hrUnknown) { record.hr_avg = 0; record.hr_min = 0; record.hr_max = 0; }
      await onSave(record);
      onClose();
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const pSum = phaseSum();
  const pWarn = pSum > form.duration_min + 5;

  return (
    <div className="fixed inset-0 z-50 bg-sl-bg flex flex-col safe-top">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sl-border shrink-0">
        <button onClick={onClose} className="text-sl-gray text-sm py-1 px-2">Annuler</button>
        <span className="text-sl-white font-semibold">Saisir une nuit</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-sl-blue text-white text-sm font-semibold px-3 py-1.5 rounded-lg min-w-[80px] text-center disabled:opacity-50">
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* ── Date ── */}
        <Section title="📅  Date de la nuit">
          <Row label="Date">
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="bg-sl-bg border border-sl-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-sl-accent"
            />
          </Row>
        </Section>

        {/* ── Horaires ── */}
        <Section title="🌙  Horaires">
          <Row label="Couché">
            <input type="time" value={form.sleep_start}
              onChange={e => set('sleep_start', e.target.value)} />
          </Row>
          <Row label="Réveillé">
            <input type="time" value={form.sleep_end}
              onChange={e => set('sleep_end', e.target.value)} />
          </Row>
          <Row label="Durée calculée">
            <span className="text-white text-sm font-semibold">
              {Math.floor(form.duration_min / 60)}h{String(form.duration_min % 60).padStart(2, '0')}
            </span>
          </Row>
        </Section>

        {/* ── Score ── */}
        <Section title="⭐  Score de sommeil">
          <Row label={`Score : ${form.sleep_score} / 100`}>
            <span
              className="text-2xl font-black ml-2"
              style={{ color: form.sleep_score >= 80 ? '#22c55e' : form.sleep_score >= 60 ? '#eab308' : '#ef4444' }}
            >
              {form.sleep_score}
            </span>
          </Row>
          <input type="range" min={0} max={100} step={1}
            value={form.sleep_score}
            onChange={e => set('sleep_score', +e.target.value)}
            className="w-full" />
        </Section>

        {/* ── Phases ── */}
        <Section title="🌊  Phases de sommeil (minutes)">
          <Row label="Sommeil profond">
            <NumberInput value={form.deep_sleep_min} min={0} max={form.duration_min}
              onChange={v => set('deep_sleep_min', v)} />
          </Row>
          <Row label="Sommeil léger">
            <NumberInput value={form.light_sleep_min} min={0} max={form.duration_min}
              onChange={v => set('light_sleep_min', v)} />
          </Row>
          <Row label="REM">
            <NumberInput value={form.rem_sleep_min} min={0} max={form.duration_min}
              onChange={v => set('rem_sleep_min', v)} />
          </Row>
          <Row label="Éveillé">
            <NumberInput value={form.awake_min} min={0} max={form.duration_min}
              onChange={v => set('awake_min', v)} />
          </Row>
          <div className={`text-xs mt-1 ${pWarn ? 'text-yellow-400' : 'text-sl-muted'}`}>
            Total phases : {pSum} min {pWarn ? '⚠️ dépasse la durée' : `/ ${form.duration_min} min`}
          </div>
        </Section>

        {/* ── FC ── */}
        <Section title="❤️  Fréquence cardiaque (bpm)">
          <Row label="Je ne sais pas">
            <label className="toggle">
              <input type="checkbox" checked={hrUnknown}
                onChange={e => setHrUnknown(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </Row>
          {!hrUnknown && (
            <>
              <Row label="Minimale">
                <NumberInput value={form.hr_min} min={30} max={120}
                  onChange={v => set('hr_min', v)} />
              </Row>
              <Row label="Moyenne">
                <NumberInput value={form.hr_avg} min={30} max={120}
                  onChange={v => set('hr_avg', v)} />
              </Row>
              <Row label="Maximale">
                <NumberInput value={form.hr_max} min={30} max={180}
                  onChange={v => set('hr_max', v)} />
              </Row>
            </>
          )}
        </Section>

        {/* ── Pas ── */}
        <Section title="👟  Pas du jour">
          <Row label="Nombre de pas">
            <input
              type="number"
              min={0}
              max={99999}
              value={form.steps}
              onChange={e => set('steps', Math.max(0, +e.target.value))}
              className="w-28 bg-sl-bg border border-sl-border rounded-lg px-3 py-1.5 text-white text-sm text-right focus:outline-none focus:border-sl-accent"
            />
          </Row>
        </Section>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

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

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Math.min(max, Math.max(min, +e.target.value)))}
      className="w-20 bg-sl-bg border border-sl-border rounded-lg px-3 py-1.5 text-white text-sm text-right focus:outline-none focus:border-sl-accent"
    />
  );
}
