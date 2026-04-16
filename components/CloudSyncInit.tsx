'use client';

import { useEffect } from 'react';
import { syncFromCloud } from '@/lib/db';

/** Fires syncFromCloud() once on first mount — pulls Neon data into IndexedDB. */
export default function CloudSyncInit() {
  useEffect(() => {
    syncFromCloud().catch((e) =>
      console.warn('[CloudSyncInit] sync failed', e)
    );
  }, []);

  return null;
}
