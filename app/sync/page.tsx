'use client';

import { useEffect, useState } from 'react';
import { getDeviceId } from '@/lib/device';
import { syncFromCloud } from '@/lib/db';

export default function SyncPage() {
  const [deviceId, setDeviceId] = useState('');
  const [input, setInput]       = useState('');
  const [syncing, setSyncing]   = useState(false);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  function copyId() {
    navigator.clipboard.writeText(deviceId);
    setMsg('Copié !');
    setTimeout(() => setMsg(''), 2000);
  }

  function applyId() {
    const trimmed = input.trim();
    if (!trimmed) return;
    localStorage.setItem('sk_device_id', trimmed);
    setDeviceId(trimmed);
    setInput('');
    setMsg('ID appliqué — sync en cours…');
    handleSync();
  }

  async function handleSync() {
    setSyncing(true);
    setMsg('Sync en cours…');
    try {
      await syncFromCloud();
      setMsg('Sync terminé — rechargez la page');
    } catch {
      setMsg('Erreur sync');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8 pt-10">
      <h1 className="text-xl font-bold text-ng-white">Sync & Appareils</h1>

      {/* Current device ID */}
      <section className="space-y-2">
        <p className="text-xs text-ng-white/50 uppercase tracking-widest">Ton Device ID</p>
        <div className="flex gap-2 items-center">
          <code className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-ng-white/80 break-all font-mono">
            {deviceId || '…'}
          </code>
          <button
            onClick={copyId}
            className="shrink-0 px-4 py-3 rounded-xl bg-ng-orange/20 border border-ng-orange/30 text-ng-orange text-sm font-bold">
            Copier
          </button>
        </div>
        <p className="text-xs text-ng-white/40">
          Même ID sur tous tes appareils = mêmes données.
        </p>
      </section>

      {/* Paste ID from another device */}
      <section className="space-y-2">
        <p className="text-xs text-ng-white/50 uppercase tracking-widest">Coller un ID existant</p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Colle ici le Device ID de ton autre appareil…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-ng-white/80 font-mono resize-none h-20 focus:outline-none focus:border-ng-orange/50"
        />
        <button
          onClick={applyId}
          disabled={!input.trim() || syncing}
          className="w-full py-3 rounded-xl bg-ng-orange/20 border border-ng-orange/30 text-ng-orange font-bold disabled:opacity-40">
          Appliquer et synchroniser
        </button>
      </section>

      {/* Manual sync */}
      <section>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-ng-white/70 font-bold disabled:opacity-40">
          {syncing ? 'Sync…' : 'Forcer la synchronisation'}
        </button>
      </section>

      {msg && (
        <p className="text-center text-ng-orange text-sm font-medium">{msg}</p>
      )}
    </div>
  );
}
