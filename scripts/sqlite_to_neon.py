#!/usr/bin/env python3
"""
sqlite_to_neon.py — Mi Fitness SQLite → NeonDB auto-import
Extrait les données sommeil + pas depuis la DB Xiaomi et les importe dans NeonDB.

Usage:
  python scripts/sqlite_to_neon.py

Config via .env (ou variables d'environnement):
  DATABASE_URL   — Neon PostgreSQL connection string
  DEVICE_ID      — UUID du device dans SleepyKnowledge (F12 → Application → localStorage → sk_device_id)
  SQLITE_PATH    — (optionnel) Chemin custom vers 8292589056.db
"""

import sqlite3
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 manquant. Installe: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("❌ python-dotenv manquant. Installe: pip install python-dotenv")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

# Charge .env puis .env.local (Vercel override)
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(PROJECT_DIR / ".env.local", override=True)

DATABASE_URL = os.environ.get("DATABASE_URL")
DEVICE_ID    = os.environ.get("DEVICE_ID")
SQLITE_PATH  = os.environ.get(
    "SQLITE_PATH",
    str(PROJECT_DIR / "folder Mi fitness" / "untitled folder 2"
        / "DataBase" / "8292589056" / "de" / "8292589056.db")
)

# ── Validation config ─────────────────────────────────────────────────────────

def check_config():
    errors = []
    if not DATABASE_URL:
        errors.append("DATABASE_URL manquant dans .env")
    if not DEVICE_ID:
        errors.append(
            "DEVICE_ID manquant dans .env\n"
            "   → Ouvre l'app SleepyKnowledge dans ton navigateur\n"
            "   → F12 → Application → Local Storage → sk_device_id\n"
            "   → Copie la valeur UUID dans .env comme DEVICE_ID=xxx"
        )
    if not Path(SQLITE_PATH).exists():
        errors.append(f"Fichier SQLite introuvable: {SQLITE_PATH}")
    if errors:
        for e in errors:
            print(f"❌ {e}\n")
        sys.exit(1)

# ── Sleep score (0–100) ───────────────────────────────────────────────────────

def calc_sleep_score(duration: int, deep: int, light: int, rem: int) -> int:
    """
    Score basé sur 3 critères:
    - Durée totale (0-40pts): optimal 420-540 min
    - Sommeil profond (0-30pts): optimal ~20% de la durée
    - REM (0-30pts): optimal ~20% de la durée
    """
    if duration <= 0:
        return 0

    # Durée (0-40)
    if duration < 300:
        dur_score = 0
    elif duration < 420:
        dur_score = int(40 * (duration - 300) / 120)
    elif duration <= 540:
        dur_score = 40
    else:
        dur_score = max(20, 40 - (duration - 540) // 30)

    # Sommeil profond (0-30) — 20% = max
    deep_score = min(30, int((deep / duration) * 150))

    # REM (0-30) — 20% = max
    rem_score = min(30, int((rem / duration) * 150))

    return min(100, dur_score + deep_score + rem_score)

# ── SQLite readers ────────────────────────────────────────────────────────────

def read_sleep_records(conn) -> list:
    rows = conn.execute("SELECT value FROM sleep ORDER BY id").fetchall()
    records = []
    for (raw,) in rows:
        try:
            records.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            pass
    return records

def read_steps_by_date(conn) -> dict:
    """Dict {date_str: steps} depuis table steps_day."""
    rows = conn.execute("SELECT value FROM steps_day ORDER BY id").fetchall()
    result = {}
    for (raw,) in rows:
        try:
            d = json.loads(raw)
            ts = d.get("time", 0)
            date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
            result[date_str] = d.get("steps", 0)
        except (json.JSONDecodeError, TypeError, OSError):
            pass
    return result

# ── Mapper SQLite → NeonDB ────────────────────────────────────────────────────

def map_sleep_record(raw: dict, steps_by_date: dict, device_id: str):
    """Mappe un enregistrement Mi Fitness → format NeonDB. Retourne None si invalide."""
    try:
        bedtime  = raw.get("bedtime", 0)
        wake_up  = raw.get("wake_up_time", 0)
        duration = raw.get("duration", 0)
        deep     = raw.get("sleep_deep_duration", 0)
        light    = raw.get("sleep_light_duration", 0)
        rem      = raw.get("sleep_rem_duration", 0)

        if not bedtime or not wake_up or duration <= 0:
            return None

        dt_sleep = datetime.fromtimestamp(bedtime)
        dt_wake  = datetime.fromtimestamp(wake_up)
        date_str = dt_sleep.strftime("%Y-%m-%d")

        awake_min   = max(0, duration - deep - light - rem)
        sleep_score = calc_sleep_score(duration, deep, light, rem)
        steps       = steps_by_date.get(date_str, 0)

        items = raw.get("items", [])

        return {
            "device_id":         device_id,
            "date":              date_str,
            "sleep_start":       dt_sleep.strftime("%H:%M"),
            "sleep_end":         dt_wake.strftime("%H:%M"),
            "duration_min":      int(duration),
            "deep_sleep_min":    int(deep),
            "light_sleep_min":   int(light),
            "rem_sleep_min":     int(rem),
            "awake_min":         int(awake_min),
            "sleep_score":       int(sleep_score),
            "hr_avg":            float(raw.get("avg_hr", 0)),
            "hr_min":            float(raw.get("min_hr", 0)),
            "hr_max":            float(raw.get("max_hr", 0)),
            "steps":             int(steps),
            "imported_at":       datetime.now(timezone.utc).isoformat(),
            "sleep_stages_json": json.dumps(items) if items else None,
        }
    except (KeyError, TypeError, ValueError, OSError):
        return None

# ── NeonDB upsert ─────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO sleep_records
  (device_id, date, sleep_start, sleep_end, duration_min,
   deep_sleep_min, light_sleep_min, rem_sleep_min, awake_min,
   sleep_score, hr_avg, hr_min, hr_max, steps, imported_at, sleep_stages_json)
VALUES
  (%(device_id)s, %(date)s, %(sleep_start)s, %(sleep_end)s, %(duration_min)s,
   %(deep_sleep_min)s, %(light_sleep_min)s, %(rem_sleep_min)s, %(awake_min)s,
   %(sleep_score)s, %(hr_avg)s, %(hr_min)s, %(hr_max)s, %(steps)s,
   %(imported_at)s, %(sleep_stages_json)s)
ON CONFLICT (device_id, date) DO UPDATE SET
  sleep_start       = EXCLUDED.sleep_start,
  sleep_end         = EXCLUDED.sleep_end,
  duration_min      = EXCLUDED.duration_min,
  deep_sleep_min    = EXCLUDED.deep_sleep_min,
  light_sleep_min   = EXCLUDED.light_sleep_min,
  rem_sleep_min     = EXCLUDED.rem_sleep_min,
  awake_min         = EXCLUDED.awake_min,
  sleep_score       = EXCLUDED.sleep_score,
  hr_avg            = EXCLUDED.hr_avg,
  hr_min            = EXCLUDED.hr_min,
  hr_max            = EXCLUDED.hr_max,
  steps             = EXCLUDED.steps,
  imported_at       = EXCLUDED.imported_at,
  sleep_stages_json = EXCLUDED.sleep_stages_json
"""

def upsert_to_neon(records: list) -> tuple:
    pg = psycopg2.connect(DATABASE_URL)
    cur = pg.cursor()
    upserted = 0
    errors = 0

    for r in records:
        try:
            cur.execute(UPSERT_SQL, r)
            upserted += 1
        except Exception as e:
            print(f"  ⚠️  Erreur pour {r.get('date')}: {e}")
            pg.rollback()
            errors += 1
            continue

    pg.commit()
    cur.close()
    pg.close()
    return upserted, errors

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("🔄 SleepyKnowledge — Mi Fitness SQLite → NeonDB")
    print(f"   Source : {SQLITE_PATH}")
    print(f"   Device : {DEVICE_ID}")
    print()

    check_config()

    # Lire SQLite (read-only)
    print("📂 Lecture SQLite...")
    sqlite_conn   = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    sleep_raw     = read_sleep_records(sqlite_conn)
    steps_by_date = read_steps_by_date(sqlite_conn)
    sqlite_conn.close()
    print(f"   {len(sleep_raw)} nuits trouvées | {len(steps_by_date)} jours de pas")

    # Mapper
    print("🔁 Mapping...")
    records = [
        r for raw in sleep_raw
        if (r := map_sleep_record(raw, steps_by_date, DEVICE_ID)) is not None
    ]
    skipped = len(sleep_raw) - len(records)
    print(f"   {len(records)} enregistrements valides | {skipped} ignorés (données manquantes)")

    if not records:
        print("⚠️  Aucun enregistrement valide. Vérifier le fichier SQLite.")
        sys.exit(0)

    # Aperçu
    print("\n📋 Aperçu (5 premiers):")
    for r in records[:5]:
        print(
            f"   {r['date']} | {r['sleep_start']}→{r['sleep_end']} "
            f"| {r['duration_min']}min | score:{r['sleep_score']} "
            f"| deep:{r['deep_sleep_min']}min | pas:{r['steps']}"
        )

    # Import NeonDB
    print(f"\n⬆️  Import vers NeonDB ({len(records)} enregistrements)...")
    upserted, errors = upsert_to_neon(records)

    print(f"\n{'✅' if errors == 0 else '⚠️ '} Terminé: {upserted} upsertés | {errors} erreurs")
    if errors == 0 and upserted > 0:
        print(f"   Device ID: {DEVICE_ID[:8]}...")
        print(f"   Plage: {records[-1]['date']} → {records[0]['date']}")

if __name__ == "__main__":
    main()
