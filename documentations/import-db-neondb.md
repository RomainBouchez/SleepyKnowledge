# Import Mi Fitness `.db` vers NeonDB

## But

Permettre l'import direct du fichier local Mi Fitness (`.db`) depuis l'interface `/import`, avec persistance locale puis synchronisation cloud NeonDB.

## Flux technique

1. **Selection fichier**
   - `app/import/page.tsx` accepte maintenant `.zip` et `.db`.
2. **Parsing**
   - `.zip` -> `parseMiFitnessZip(...)`
   - `.db` -> `parseMiFitnessDb(...)` (`lib/sqlite-mi-parser.ts`, via sql.js en navigateur)
3. **Import local**
   - Chaque nuit est sauvegardee via `upsertSleepRecord(...)` (`lib/db.ts`) dans IndexedDB (Dexie).
4. **Sync NeonDB**
   - `upsertSleepRecord(...)` declenche `pushSleepRecords(...)` (`lib/cloud-sync.ts`)
   - `pushSleepRecords(...)` envoie `POST /api/db/sleep`
   - `app/api/db/sleep/route.ts` appelle `neonUpsertSleepRecord(...)` (`lib/neon-db.ts`)
   - Donnees upsert dans la table `sleep_records` (conflit sur `(device_id, date)`).

## Point de verification

- Si l'import `.db` affiche des nuits dans "Donnees stockees", alors le push Neon est deja declenche en arriere-plan.
- Verifier la presence des lignes dans `sleep_records` cote Neon pour confirmer la sync distante.
