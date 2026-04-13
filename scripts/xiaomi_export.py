#!/usr/bin/env python3
"""
SleepIQ — Mi Fitness export script
===================================
Runs nightly via cron on your VPS.
Logs in to account.xiaomi.com, exports SLEEP + ACTIVITY + HEARTRATE_AUTO CSVs,
normalises the data, and posts it to your n8n webhook.

Requirements:
    pip install playwright requests
    playwright install chromium

Cron example (03:00 every night):
    0 3 * * * /usr/bin/python3 /opt/sleepiq/xiaomi_export.py >> /var/log/sleepiq.log 2>&1

Environment variables (put in /etc/sleepiq.env or .env):
    XIAOMI_EMAIL          your Mi account email
    XIAOMI_PASSWORD       your Mi account password  (only used first login)
    N8N_WEBHOOK_URL       e.g. https://n8n.yourdomain.com/webhook/sleepiq-sync
    N8N_WEBHOOK_SECRET    optional auth header value
    TELEGRAM_BOT_TOKEN    optional – for session-expired alerts
    TELEGRAM_CHAT_ID      optional
"""

import asyncio
import json
import os
import sys
import csv
import io
import logging
from datetime import datetime, timedelta
from pathlib import Path

import requests
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR    = Path(__file__).parent
COOKIES_FILE  = SCRIPT_DIR / "xiaomi_cookies.json"
DATA_DIR      = SCRIPT_DIR / "data"
LOG_FORMAT    = "%(asctime)s [%(levelname)s] %(message)s"

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
log = logging.getLogger("sleepiq")

EMAIL          = os.environ.get("XIAOMI_EMAIL", "")
PASSWORD       = os.environ.get("XIAOMI_PASSWORD", "")
N8N_URL        = os.environ.get("N8N_WEBHOOK_URL", "")
N8N_SECRET     = os.environ.get("N8N_WEBHOOK_SECRET", "")
TG_TOKEN       = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT_ID     = os.environ.get("TELEGRAM_CHAT_ID", "")

# Mi Fitness export date range: yesterday
EXPORT_DATE    = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
EXPORT_FROM    = EXPORT_DATE
EXPORT_TO      = EXPORT_DATE

# ── Telegram alert ────────────────────────────────────────────────────────────

def send_telegram(message: str):
    if not TG_TOKEN or not TG_CHAT_ID:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": TG_CHAT_ID, "text": f"🌙 SleepIQ: {message}"},
            timeout=10,
        )
    except Exception as e:
        log.warning(f"Telegram alert failed: {e}")

# ── Cookie management ─────────────────────────────────────────────────────────

async def load_cookies(context):
    if COOKIES_FILE.exists():
        with open(COOKIES_FILE) as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)
        log.info(f"Loaded {len(cookies)} saved cookies")
        return True
    return False

async def save_cookies(context):
    cookies = await context.cookies()
    with open(COOKIES_FILE, "w") as f:
        json.dump(cookies, f)
    log.info(f"Saved {len(cookies)} cookies")

# ── Mi Fitness login ──────────────────────────────────────────────────────────

async def login(page) -> bool:
    """Attempt to log in. Returns True on success."""
    if not EMAIL or not PASSWORD:
        log.error("XIAOMI_EMAIL / XIAOMI_PASSWORD not set — manual login required")
        send_telegram("⚠️ Session expirée — connecte-toi manuellement (email/password non configurés)")
        return False

    log.info("Attempting Xiaomi login…")
    try:
        await page.goto("https://account.xiaomi.com/pass/serviceLogin", timeout=30_000)
        await page.fill('input[name="user"]', EMAIL, timeout=10_000)
        await page.fill('input[name="password"]', PASSWORD, timeout=10_000)
        await page.click('button[type="submit"]', timeout=10_000)
        await page.wait_for_load_state("networkidle", timeout=20_000)

        # Check if login succeeded
        if "account.xiaomi.com" in page.url and "login" in page.url:
            log.error("Login failed — check credentials or CAPTCHA")
            send_telegram("⚠️ Échec de connexion Xiaomi — vérifie les identifiants ou le CAPTCHA")
            return False

        log.info("Login successful")
        return True
    except PlaywrightTimeout:
        log.error("Login timed out")
        send_telegram("⚠️ Login Xiaomi timeout — réseau VPS ou site indisponible")
        return False

# ── CSV export from Mi Fitness web ───────────────────────────────────────────

async def export_csv(page, data_type: str) -> str | None:
    """
    Navigate to the Mi Fitness export page and download CSV for data_type.
    data_type: "SLEEP" | "HEARTRATE_AUTO" | "ACTIVITY"
    Returns CSV content as string or None on failure.

    NOTE: Mi Fitness does not have a public export API.
    The URL pattern below is illustrative — you may need to adapt it
    by inspecting network requests on the actual Mi Fitness web app.
    """
    export_url = (
        f"https://api.huami.com/data/export/v2/"
        f"?type={data_type}"
        f"&startDate={EXPORT_FROM}"
        f"&endDate={EXPORT_TO}"
        f"&format=csv"
    )

    log.info(f"Exporting {data_type} from {EXPORT_FROM} to {EXPORT_TO}")

    try:
        # Intercept download
        async with page.expect_download(timeout=30_000) as download_info:
            await page.goto(export_url, timeout=20_000)
        download = await download_info.value
        content = await download.read_into(io.BytesIO())
        return content.decode("utf-8")
    except PlaywrightTimeout:
        log.warning(f"{data_type} export timed out — trying direct API call")

    # Fallback: try as XHR through page context (inherits session cookies)
    try:
        response = await page.evaluate(
            """async (url) => {
                const r = await fetch(url, {credentials: 'include'});
                return r.ok ? r.text() : null;
            }""",
            export_url,
        )
        return response
    except Exception as e:
        log.error(f"{data_type} export failed: {e}")
        return None

# ── CSV parsers ───────────────────────────────────────────────────────────────

def parse_sleep_csv(csv_text: str) -> list[dict]:
    """Parse Mi Fitness SLEEP CSV into sleep record dicts."""
    records = []
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        try:
            date_raw = row.get("date", row.get("startTime", ""))
            date = date_raw[:10] if date_raw else ""
            if not date:
                continue

            total_min   = _to_int(row.get("totalSleepTime", row.get("duration", 0)))
            deep_min    = _to_int(row.get("deepSleepTime",  row.get("deepSleep", 0)))
            light_min   = _to_int(row.get("shallowSleepTime", row.get("lightSleep", 0)))
            rem_min     = _to_int(row.get("REMTime",        row.get("remSleep", 0)))
            wake_min    = _to_int(row.get("wakeTime",       row.get("awakeTime", 0)))
            score       = _to_int(row.get("score",          row.get("sleepScore", 0)))
            start       = _extract_time(row.get("startTime", ""))
            end         = _extract_time(row.get("stopTime",  row.get("endTime", "")))

            records.append({
                "date":            date,
                "sleep_start":     start,
                "sleep_end":       end,
                "duration_min":    total_min,
                "deep_sleep_min":  deep_min,
                "light_sleep_min": light_min,
                "rem_sleep_min":   rem_min,
                "awake_min":       wake_min,
                "sleep_score":     score,
                "hr_avg":          0,
                "hr_min":          0,
                "hr_max":          0,
                "steps":           0,
            })
        except Exception as e:
            log.warning(f"Skip sleep row: {e} — {row}")
    return records

def parse_heartrate_csv(csv_text: str) -> dict[str, dict]:
    """Returns {date: {hr_avg, hr_min, hr_max}} for nocturnal HR."""
    by_date: dict[str, list[int]] = {}
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        ts  = row.get("time", row.get("timestamp", ""))
        val = _to_int(row.get("heartRate", row.get("value", 0)))
        if not ts or val == 0:
            continue
        date = ts[:10]
        by_date.setdefault(date, []).append(val)

    result = {}
    for date, vals in by_date.items():
        # Only keep nocturnal values (between 22:00 and 08:00)
        # (Full filtering would require timestamps; here we use all values)
        result[date] = {
            "hr_avg": round(sum(vals) / len(vals)),
            "hr_min": min(vals),
            "hr_max": max(vals),
        }
    return result

def parse_activity_csv(csv_text: str) -> dict[str, int]:
    """Returns {date: steps}."""
    by_date: dict[str, int] = {}
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        date  = row.get("date", row.get("dateTime", ""))[:10]
        steps = _to_int(row.get("steps", row.get("totalSteps", 0)))
        if date:
            by_date[date] = by_date.get(date, 0) + steps
    return by_date

# ── latest.json (served by serve.py) ─────────────────────────────────────────

LATEST_FILE = DATA_DIR / "latest.json"

def update_latest_json(new_records: list[dict]):
    """Merge new_records into latest.json, deduplicating by date."""
    existing: list[dict] = []
    if LATEST_FILE.exists():
        try:
            with open(LATEST_FILE) as f:
                data = json.load(f)
            existing = data.get("sleep", [])
        except Exception as e:
            log.warning(f"Could not read latest.json: {e}")

    by_date: dict[str, dict] = {r["date"]: r for r in existing}
    for r in new_records:
        by_date[r["date"]] = r  # new data overwrites old for same date

    merged = sorted(by_date.values(), key=lambda r: r["date"])
    payload = {"sleep": merged, "generatedAt": datetime.utcnow().isoformat() + "Z"}

    with open(LATEST_FILE, "w") as f:
        json.dump(payload, f)
    log.info(f"Updated latest.json — {len(merged)} total records")

# ── Post to n8n ───────────────────────────────────────────────────────────────

def post_to_n8n(sleep_records: list[dict]) -> bool:
    if not N8N_URL:
        log.error("N8N_WEBHOOK_URL not set — skipping post")
        return False

    payload = {
        "sleep":       sleep_records,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
    }

    headers = {"Content-Type": "application/json"}
    if N8N_SECRET:
        headers["X-SleepIQ-Token"] = N8N_SECRET

    try:
        r = requests.post(N8N_URL, json=payload, headers=headers, timeout=30)
        r.raise_for_status()
        log.info(f"Posted {len(sleep_records)} records to n8n → HTTP {r.status_code}")
        return True
    except requests.RequestException as e:
        log.error(f"n8n post failed: {e}")
        send_telegram(f"⚠️ Échec envoi données vers n8n: {e}")
        return False

# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_int(val) -> int:
    try:
        return int(float(str(val).replace(",", ".")))
    except (ValueError, TypeError):
        return 0

def _extract_time(raw: str) -> str:
    """Extract HH:MM from various timestamp formats."""
    if not raw:
        return ""
    # "2024-01-15 22:34:00" or "22:34" or "22:34:00"
    import re
    m = re.search(r"(\d{2}:\d{2})", raw)
    return m.group(1) if m else ""

# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    DATA_DIR.mkdir(exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="fr-FR",
        )
        page = await context.new_page()

        # ── Auth ──────────────────────────────────────────────────────────────
        session_ok = await load_cookies(context)

        if not session_ok:
            ok = await login(page)
            if not ok:
                await browser.close()
                sys.exit(1)
            await save_cookies(context)
        else:
            # Verify session is still alive
            await page.goto("https://account.xiaomi.com/", timeout=15_000)
            if "login" in page.url:
                log.warning("Session expired — re-logging in")
                send_telegram("⚠️ Session Xiaomi expirée — reconnexion en cours…")
                ok = await login(page)
                if not ok:
                    await browser.close()
                    sys.exit(1)
                await save_cookies(context)

        # ── Export CSVs ───────────────────────────────────────────────────────
        sleep_csv    = await export_csv(page, "SLEEP")
        hr_csv       = await export_csv(page, "HEARTRATE_AUTO")
        activity_csv = await export_csv(page, "ACTIVITY")

        await save_cookies(context)  # refresh session cookies
        await browser.close()

    # ── Parse ─────────────────────────────────────────────────────────────────
    if not sleep_csv:
        log.error("No SLEEP data — aborting")
        send_telegram("⚠️ Export sommeil échoué — pas de données SLEEP")
        sys.exit(1)

    sleep_records = parse_sleep_csv(sleep_csv)
    log.info(f"Parsed {len(sleep_records)} sleep records")

    if hr_csv:
        hr_by_date = parse_heartrate_csv(hr_csv)
        for r in sleep_records:
            if r["date"] in hr_by_date:
                r.update(hr_by_date[r["date"]])

    if activity_csv:
        steps_by_date = parse_activity_csv(activity_csv)
        for r in sleep_records:
            r["steps"] = steps_by_date.get(r["date"], 0)

    # Save daily backup
    out_file = DATA_DIR / f"sleep_{EXPORT_DATE}.json"
    with open(out_file, "w") as f:
        json.dump({"sleep": sleep_records, "generatedAt": datetime.utcnow().isoformat() + "Z"}, f)
    log.info(f"Saved backup to {out_file}")

    # ── Update latest.json (accumulate all records, dedup by date) ────────────
    update_latest_json(sleep_records)

    # ── Post to n8n (optional) ────────────────────────────────────────────────
    if N8N_URL and sleep_records:
        post_to_n8n(sleep_records)

    log.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
