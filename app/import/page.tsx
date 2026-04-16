'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SleepStageItem } from '@/lib/types';
import Navigation from '@/components/Navigation';
import { parseMiFitnessZip, type SportRecord } from '@/lib/mifitness-parser';
import { upsertSleepRecord, getSleepRecords, getExistingDates } from '@/lib/db';
import type { SleepRecord } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'idle' | 'password' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

interface ParsedData {
  sleepRecords: Omit<SleepRecord, 'id' | 'imported_at'>[];
  sportRecords: SportRecord[];
  stats: { totalSleep: number; totalSport: number; dateRange: string };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [overlapDates, setOverlapDates] = useState<string[]>([]);
  const [overwriteChecked, setOverwriteChecked] = useState(false);

  // DB viewer
  const [dbRecords, setDbRecords] = useState<SleepRecord[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbLimit, setDbLimit] = useState(30);
  const [selected, setSelected] = useState<SleepRecord | null>(null);

  useEffect(() => {
    loadDbRecords();
  }, []);

  const loadDbRecords = async (limit = 30) => {
    setDbLoading(true);
    const records = await getSleepRecords(limit);
    setDbRecords(records.slice().reverse()); // newest first
    setDbLoading(false);
  };

  // ── File selection ──────────────────────────────────────────────────────────

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('Le fichier doit être un .zip');
      setStep('error');
      return;
    }
    setFile(f);
    setStep('password');
    setError('');
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // ── Unzip + parse ──────────────────────────────────────────────────────────

  const handleParse = async () => {
    if (!file) return;
    setStep('parsing');
    setProgress(0);
    setError('');

    try {
      const { BlobReader, ZipReader, TextWriter } = await import('@zip.js/zip.js');

      const reader = new ZipReader(new BlobReader(file), {
        password: password || undefined,
      });

      setProgress(20);

      const entries = await reader.getEntries();
      setProgress(40);

      const csvFiles = new Map<string, string>();

      // Extract the three CSVs we need
      const targets = [
        'hlth_center_aggregated_fitness_data.csv',
        'hlth_center_sport_record.csv',
        'hlth_center_fitness_data.csv',
      ];

      let done = 0;
      for (const entry of entries) {
        const name = entry.filename.split('/').pop() ?? '';
        if (targets.some(t => name.endsWith(t))) {
          // getData is only present on FileEntry (not DirectoryEntry)
          if (!('getData' in entry) || typeof entry.getData !== 'function') continue;
          const text = await entry.getData(new TextWriter());
          csvFiles.set(name, text);
          done++;
          setProgress(40 + (done / targets.length) * 40);
        }
      }

      await reader.close();
      setProgress(90);

      if (csvFiles.size === 0) {
        throw new Error('Aucun fichier CSV Mi Fitness trouvé dans ce ZIP. Vérifiez que c\'est bien un export MiFitness.');
      }

      const result = parseMiFitnessZip(csvFiles);
      setProgress(100);

      // Check overlap with existing DB records
      const candidateDates = result.sleepRecords
        .filter(r => !(r.sleep_score === 0 && r.duration_min === 0))
        .map(r => r.date);
      const existing = await getExistingDates(candidateDates);
      setOverlapDates(existing);
      setOverwriteChecked(false);

      setParsed(result);
      setStep('preview');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('password') || msg.includes('encrypted') || msg.includes('wrong password')) {
        setError('Mot de passe incorrect. Réessaie.');
        setStep('password');
      } else {
        setError(msg);
        setStep('error');
      }
    }
  };

  // ── Import into IndexedDB ──────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parsed) return;
    setStep('importing');
    setProgress(0);

    const now = new Date().toISOString();
    const total = parsed.sleepRecords.length;
    let count = 0;

    for (const record of parsed.sleepRecords) {
      // Skip records with zero sleep score and zero duration (no data)
      if (record.sleep_score === 0 && record.duration_min === 0) continue;
      await upsertSleepRecord({ ...record, imported_at: now });
      count++;
      setProgress(Math.round((count / total) * 100));
    }

    setImportedCount(count);
    setStep('done');
    loadDbRecords(dbLimit);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-sl-bg pb-24">
      <div className="max-w-lg mx-auto px-4 pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Importer Mi Fitness</h1>
          <p className="text-sl-muted text-sm">
            Importe ton export ZIP Mi Fitness pour charger tes vraies données de sommeil.
          </p>
        </div>

        {/* ── STEP: idle — drag & drop zone ── */}
        {(step === 'idle' || step === 'error') && (
          <>
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors
                ${isDragOver
                  ? 'border-sl-accent bg-sl-accent/10'
                  : 'border-sl-border hover:border-sl-accent/50 bg-sl-card'}
              `}
            >
              <div className="text-4xl mb-3">📦</div>
              <p className="text-white font-medium mb-1">Dépose ton fichier ZIP ici</p>
              <p className="text-sl-muted text-sm">ou clique pour sélectionner</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={onFileChange}
                className="hidden"
              />
            </div>

            {step === 'error' && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </>
        )}

        {/* ── STEP: password ── */}
        {step === 'password' && (
          <div className="bg-sl-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔐</span>
              <div>
                <p className="text-white font-medium">{file?.name}</p>
                <p className="text-sl-muted text-xs">
                  {file ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : ''}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sl-muted text-sm mb-2">
                Mot de passe du ZIP
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleParse()}
                placeholder="Laisse vide si pas de mot de passe"
                className="w-full bg-sl-bg border border-sl-border rounded-xl px-4 py-3 text-white placeholder-sl-muted focus:outline-none focus:border-sl-accent"
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('idle'); setFile(null); setPassword(''); }}
                className="flex-1 py-3 rounded-xl border border-sl-border text-sl-muted hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleParse}
                className="flex-1 py-3 rounded-xl bg-sl-accent text-white font-semibold hover:bg-sl-accent/80 transition-colors"
              >
                Dézipper
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: parsing ── */}
        {step === 'parsing' && (
          <div className="bg-sl-card rounded-2xl p-8 text-center space-y-4">
            <div className="text-3xl animate-pulse">⚙️</div>
            <p className="text-white font-medium">Déchiffrement en cours…</p>
            <ProgressBar value={progress} />
            <p className="text-sl-muted text-sm">{progress}%</p>
          </div>
        )}

        {/* ── STEP: preview ── */}
        {step === 'preview' && parsed && (
          <div className="space-y-4">
            <div className="bg-sl-card rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold text-lg">Aperçu des données</h2>

              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Nuits de sommeil" value={parsed.stats.totalSleep} icon="🌙" />
                <StatBox label="Séances sport" value={parsed.stats.totalSport} icon="🏋️" />
              </div>

              <div className="bg-sl-bg rounded-xl p-4">
                <p className="text-sl-muted text-xs mb-1">Période couverte</p>
                <p className="text-white text-sm font-medium">{parsed.stats.dateRange}</p>
              </div>

              {parsed.sleepRecords.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sl-muted text-xs uppercase tracking-wider">Aperçu (3 premières nuits)</p>
                  {parsed.sleepRecords.slice(0, 3).map(r => (
                    <div key={r.date} className="flex items-center justify-between bg-sl-bg rounded-xl px-4 py-3">
                      <span className="text-sl-muted text-sm">{r.date}</span>
                      <span className="text-white text-sm">{r.sleep_start} → {r.sleep_end}</span>
                      <span className="text-sl-accent font-semibold text-sm">{r.sleep_score} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {overlapDates.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-400 text-lg leading-none">⚠️</span>
                  <div>
                    <p className="text-yellow-300 text-sm font-medium">
                      {overlapDates.length} nuit{overlapDates.length > 1 ? 's' : ''} déjà en base
                    </p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">
                      Ces dates seront écrasées par les nouvelles données.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteChecked}
                    onChange={e => setOverwriteChecked(e.target.checked)}
                    className="w-4 h-4 accent-yellow-400"
                  />
                  <span className="text-yellow-300 text-sm">
                    Je confirme l&apos;écrasement des {overlapDates.length} nuit{overlapDates.length > 1 ? 's' : ''} existante{overlapDates.length > 1 ? 's' : ''}
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('idle'); setFile(null); setParsed(null); setPassword(''); }}
                className="flex-1 py-3 rounded-xl border border-sl-border text-sl-muted hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleImport}
                disabled={overlapDates.length > 0 && !overwriteChecked}
                className="flex-1 py-3 rounded-xl bg-sl-accent text-white font-semibold hover:bg-sl-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Importer {parsed.stats.totalSleep} nuits
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: importing ── */}
        {step === 'importing' && (
          <div className="bg-sl-card rounded-2xl p-8 text-center space-y-4">
            <div className="text-3xl animate-pulse">💾</div>
            <p className="text-white font-medium">Import en cours…</p>
            <ProgressBar value={progress} />
            <p className="text-sl-muted text-sm">{progress}%</p>
          </div>
        )}

        {/* ── STEP: done ── */}
        {step === 'done' && (
          <div className="bg-sl-card rounded-2xl p-8 text-center space-y-5">
            <div className="text-5xl">✅</div>
            <div>
              <p className="text-white font-bold text-xl mb-1">Import terminé !</p>
              <p className="text-sl-muted text-sm">
                {importedCount} nuit{importedCount > 1 ? 's' : ''} importée{importedCount > 1 ? 's' : ''} dans SleepIQ
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 rounded-xl bg-sl-accent text-white font-semibold hover:bg-sl-accent/80 transition-colors"
            >
              Voir le dashboard →
            </button>
            <button
              onClick={() => { setStep('idle'); setFile(null); setParsed(null); setPassword(''); setImportedCount(0); }}
              className="w-full py-3 rounded-xl border border-sl-border text-sl-muted hover:text-white transition-colors"
            >
              Importer un autre fichier
            </button>
          </div>
        )}
        {/* ── Section : données en base ── */}
        <div className="mt-10 mb-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold text-lg">Données stockées</h2>
              <p className="text-sl-muted text-xs">{dbRecords.length} nuit{dbRecords.length !== 1 ? 's' : ''} en base</p>
            </div>
            <button
              onClick={() => loadDbRecords(dbLimit)}
              className="text-sl-accent text-sm hover:opacity-70 transition-opacity"
            >
              ↻ Rafraîchir
            </button>
          </div>

          {dbLoading ? (
            <div className="text-center py-8 text-sl-muted text-sm">Chargement…</div>
          ) : dbRecords.length === 0 ? (
            <div className="bg-sl-card rounded-2xl p-8 text-center">
              <div className="text-3xl mb-3">🗃️</div>
              <p className="text-sl-muted text-sm">Aucune donnée en base.<br />Importe un fichier ZIP pour commencer.</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[90px_1fr_1fr_52px] gap-2 px-3 mb-1">
                <span className="text-sl-muted text-xs">Date</span>
                <span className="text-sl-muted text-xs">Horaires</span>
                <span className="text-sl-muted text-xs">Phases</span>
                <span className="text-sl-muted text-xs text-right">Score</span>
              </div>

              <div className="space-y-1">
                {dbRecords.map(r => (
                  <div
                    key={r.date}
                    onClick={() => setSelected(r)}
                    className="bg-sl-card rounded-xl px-3 py-3 grid grid-cols-[90px_1fr_1fr_52px] gap-2 items-center cursor-pointer hover:bg-sl-surface transition-colors active:scale-[0.99]"
                  >
                    {/* Date */}
                    <span className="text-white text-xs font-medium">{r.date}</span>

                    {/* Horaires */}
                    <span className="text-sl-muted text-xs">
                      {r.sleep_start} → {r.sleep_end}
                      <br />
                      <span className="text-white">{Math.floor(r.duration_min / 60)}h{String(r.duration_min % 60).padStart(2, '0')}</span>
                    </span>

                    {/* Phases */}
                    <div className="text-xs space-y-0.5">
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                        <span className="text-sl-muted">Prof</span>
                        <span className="text-white ml-auto">{r.deep_sleep_min}m</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                        <span className="text-sl-muted">REM</span>
                        <span className="text-white ml-auto">{r.rem_sleep_min}m</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                        <span className="text-sl-muted">FC</span>
                        <span className="text-white ml-auto">{r.hr_avg} bpm</span>
                      </div>
                    </div>

                    {/* Score */}
                    <span
                      className="text-right font-bold text-sm"
                      style={{ color: r.sleep_score >= 80 ? '#22c55e' : r.sleep_score >= 60 ? '#eab308' : '#ef4444' }}
                    >
                      {r.sleep_score}
                    </span>
                  </div>
                ))}
              </div>

              {/* Voir plus */}
              {dbRecords.length >= dbLimit && (
                <button
                  onClick={() => {
                    const next = dbLimit + 30;
                    setDbLimit(next);
                    loadDbRecords(next);
                  }}
                  className="w-full mt-3 py-3 rounded-xl border border-sl-border text-sl-muted text-sm hover:text-white transition-colors"
                >
                  Voir 30 de plus…
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Drawer détail nuit ── */}
      {selected && (
        <SleepDetailDrawer record={selected} onClose={() => setSelected(null)} />
      )}

      <Navigation />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-sl-bg rounded-full h-2">
      <div
        className="bg-sl-accent h-2 rounded-full transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-sl-bg rounded-xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-white font-bold text-xl">{value}</div>
      <div className="text-sl-muted text-xs">{label}</div>
    </div>
  );
}

// ── Sleep Detail Drawer ────────────────────────────────────────────────────────

function SleepDetailDrawer({ record: r, onClose }: { record: SleepRecord; onClose: () => void }) {
  const scoreColor = r.sleep_score >= 80 ? '#22c55e' : r.sleep_score >= 60 ? '#eab308' : '#ef4444';
  const hours = Math.floor(r.duration_min / 60);
  const mins  = r.duration_min % 60;

  const phases = [
    { name: 'Profond',  minutes: r.deep_sleep_min,  color: '#3b82f6' },
    { name: 'Léger',    minutes: r.light_sleep_min, color: '#6366f1' },
    { name: 'REM',      minutes: r.rem_sleep_min,   color: '#a855f7' },
    { name: 'Éveillé',  minutes: r.awake_min,       color: '#f97316' },
  ];

  const totalPhases = phases.reduce((s, p) => s + p.minutes, 0) || 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-sl-surface rounded-t-3xl pb-8"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-sl-border" />
        </div>

        <div className="px-5 pt-2 pb-24">

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-sl-muted text-xs mb-0.5">
                {new Date(r.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h2 className="text-white text-xl font-bold">
                {r.sleep_start} → {r.sleep_end}
              </h2>
              <p className="text-sl-muted text-sm">{hours}h{String(mins).padStart(2, '0')} de sommeil</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black" style={{ color: scoreColor }}>{r.sleep_score}</p>
              <p className="text-sl-muted text-xs">/ 100</p>
            </div>
          </div>

          {/* ── Graphique timeline ── */}
          <div className="bg-sl-card rounded-2xl p-4 mb-4">
            <p className="text-sl-muted text-xs uppercase tracking-wider mb-3">Nuit en détail</p>
            {r.sleep_stages_json ? (
              <SleepTimelineChart
                items={JSON.parse(r.sleep_stages_json) as SleepStageItem[]}
                bedtimeLabel={r.sleep_start}
                wakeLabel={r.sleep_end}
              />
            ) : (
              /* Fallback: barre empilée si pas de données granulaires */
              <div>
                <div className="flex rounded-full overflow-hidden h-4 mb-3">
                  {phases.map(p => (
                    <div
                      key={p.name}
                      style={{ width: `${(p.minutes / totalPhases) * 100}%`, background: p.color }}
                    />
                  ))}
                </div>
                <p className="text-sl-muted text-xs text-center">Données granulaires non disponibles</p>
              </div>
            )}

            {/* Légende */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {phases.map(p => (
                <div key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                  <span className="text-sl-muted">{p.name}</span>
                  <span className="text-white ml-auto font-medium">{p.minutes} min</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Fréquence cardiaque ── */}
          <div className="bg-sl-card rounded-2xl p-4 mb-4">
            <p className="text-sl-muted text-xs uppercase tracking-wider mb-3">Fréquence cardiaque</p>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sl-muted text-xs w-8">Min</span>
              <div className="flex-1 relative h-3 bg-sl-bg rounded-full">
                {/* barre min → max */}
                <div
                  className="absolute h-3 rounded-full bg-gradient-to-r from-blue-500 to-red-400"
                  style={{
                    left: `${((r.hr_min - 30) / 80) * 100}%`,
                    right: `${100 - ((r.hr_max - 30) / 80) * 100}%`,
                  }}
                />
                {/* point moyenne */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-sl-accent"
                  style={{ left: `calc(${((r.hr_avg - 30) / 80) * 100}% - 6px)` }}
                />
              </div>
              <span className="text-sl-muted text-xs w-8 text-right">Max</span>
            </div>
            <div className="grid grid-cols-3 text-center">
              <div>
                <p className="text-blue-400 font-bold text-lg">{r.hr_min}</p>
                <p className="text-sl-muted text-xs">Min</p>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{r.hr_avg}</p>
                <p className="text-sl-muted text-xs">Moy.</p>
              </div>
              <div>
                <p className="text-red-400 font-bold text-lg">{r.hr_max}</p>
                <p className="text-sl-muted text-xs">Max</p>
              </div>
            </div>
          </div>

          {/* ── Autres métriques ── */}
          <div className="grid grid-cols-2 gap-3">
            <MetricTile icon="👟" label="Pas" value={r.steps.toLocaleString('fr-FR')} />
            <MetricTile icon="⏱️" label="Éveillé" value={`${r.awake_min} min`} />
            <MetricTile icon="🌊" label="Sommeil profond" value={`${Math.round((r.deep_sleep_min / totalPhases) * 100)}%`} />
            <MetricTile icon="🌀" label="REM" value={`${Math.round((r.rem_sleep_min / totalPhases) * 100)}%`} />
          </div>

          {/* Bouton fermer */}
          <button
            onClick={onClose}
            className="w-full mt-5 py-3 rounded-xl border border-sl-border text-sl-muted hover:text-white transition-colors text-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}

function MetricTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-sl-card rounded-xl p-4 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-white font-semibold text-sm">{value}</p>
        <p className="text-sl-muted text-xs">{label}</p>
      </div>
    </div>
  );
}

// ── Sleep Timeline Chart ───────────────────────────────────────────────────────

const STAGE_CONFIG: Record<number, { color: string; gradientTop: string; yPct: number }> = {
  4: { color: '#1e40af', gradientTop: '#1d4ed8', yPct: 0.28 }, // deep  – dark blue, low
  3: { color: '#2563eb', gradientTop: '#3b82f6', yPct: 0.52 }, // light – blue, medium
  2: { color: '#06b6d4', gradientTop: '#22d3ee', yPct: 0.72 }, // REM   – cyan, high
  5: { color: '#f97316', gradientTop: '#fb923c', yPct: 0.96 }, // awake – orange, spike
};

function SleepTimelineChart({
  items,
  bedtimeLabel,
  wakeLabel,
}: {
  items: SleepStageItem[];
  bedtimeLabel: string;
  wakeLabel: string;
}) {
  if (!items.length) return null;

  const W = 340;
  const H = 110;
  const BOTTOM_PAD = 0; // rects touch the bottom

  const start = items[0].start_time;
  const end   = items[items.length - 1].end_time;
  const span  = end - start || 1;

  const toX = (t: number) => ((t - start) / span) * W;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* One gradient per stage */}
          {Object.entries(STAGE_CONFIG).map(([state, cfg]) => (
            <linearGradient key={state} id={`sg-${state}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.gradientTop} stopOpacity="1" />
              <stop offset="100%" stopColor={cfg.color} stopOpacity="0.7" />
            </linearGradient>
          ))}
          {/* Subtle dark bottom fade */}
          <linearGradient id="sg-bottom-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="70%" stopColor="transparent" stopOpacity="0" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width={W} height={H} fill="#0f172a" rx="8" />

        {/* Horizontal guide lines */}
        {[0.28, 0.52, 0.72].map((pct, i) => (
          <line
            key={i}
            x1="0" y1={H - pct * H}
            x2={W} y2={H - pct * H}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4"
          />
        ))}

        {/* Sleep stage segments */}
        {items.map((item, i) => {
          const cfg = STAGE_CONFIG[item.state] ?? STAGE_CONFIG[3];
          const x = toX(item.start_time);
          const w = Math.max(1.5, toX(item.end_time) - x);
          const rectH = cfg.yPct * H;
          const y = H - rectH - BOTTOM_PAD;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={rectH}
                fill={`url(#sg-${item.state})`}
                rx={item.state === 5 ? 2 : 0} // rounded top only for wake spikes
              />
            </g>
          );
        })}

        {/* Bottom fade overlay */}
        <rect x="0" y="0" width={W} height={H} fill="url(#sg-bottom-fade)" rx="8" />
      </svg>

      {/* Time labels */}
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-sl-muted text-[10px]">{bedtimeLabel} Couché</span>
        <span className="text-sl-muted text-[10px]">Réveillé {wakeLabel}</span>
      </div>
    </div>
  );
}
