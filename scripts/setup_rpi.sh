#!/usr/bin/env bash
# ============================================================
# SleepIQ — Raspberry Pi setup script
# ============================================================
# Run once as your normal user (not root):
#   chmod +x setup_rpi.sh && ./setup_rpi.sh
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
SERVICE_EXPORT="sleepiq-export"
SERVICE_SERVE="sleepiq-serve"

echo "=== SleepIQ Raspberry Pi Setup ==="

# ── 1. System dependencies ────────────────────────────────────────────────────
echo "[1/6] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y python3 python3-pip python3-venv

# ── 2. Python virtualenv ──────────────────────────────────────────────────────
echo "[2/6] Creating Python virtual environment..."
python3 -m venv "$SCRIPT_DIR/.venv"
source "$SCRIPT_DIR/.venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet playwright requests
playwright install chromium --with-deps

# ── 3. Create .env if missing ─────────────────────────────────────────────────
echo "[3/6] Checking environment variables..."
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'EOF'
XIAOMI_EMAIL=your@email.com
XIAOMI_PASSWORD=yourpassword
SYNC_SECRET_TOKEN=choose-a-secret-token
SERVE_PORT=8765
# N8N_WEBHOOK_URL=   # optional, leave empty if not using n8n
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
EOF
    echo "  Created $ENV_FILE — EDIT IT with your credentials before continuing!"
    echo "  Then re-run this script."
    exit 0
fi

# ── 4. Create data directory ──────────────────────────────────────────────────
echo "[4/6] Creating data directory..."
mkdir -p "$SCRIPT_DIR/data"

# ── 5. Systemd service: HTTP server ──────────────────────────────────────────
echo "[5/6] Installing systemd service: $SERVICE_SERVE..."
sudo bash -c "cat > /etc/systemd/system/$SERVICE_SERVE.service" << EOF
[Unit]
Description=SleepIQ HTTP Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$SCRIPT_DIR/.venv/bin/python3 $SCRIPT_DIR/serve.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_SERVE"
sudo systemctl restart "$SERVICE_SERVE"
echo "  HTTP server started on port $(grep SERVE_PORT "$ENV_FILE" | cut -d= -f2 || echo 8765)"

# ── 6. Cron job: nightly export at 03:00 ─────────────────────────────────────
echo "[6/6] Installing cron job (runs daily at 03:00)..."
CRON_CMD="0 3 * * * source $ENV_FILE && $SCRIPT_DIR/.venv/bin/python3 $SCRIPT_DIR/xiaomi_export.py >> /var/log/sleepiq.log 2>&1"
# Add only if not already present
(crontab -l 2>/dev/null | grep -v "xiaomi_export.py"; echo "$CRON_CMD") | crontab -

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Run the export script once manually to test:"
echo "     source $ENV_FILE && .venv/bin/python3 xiaomi_export.py"
echo ""
echo "  2. Check the server is responding:"
echo "     curl http://localhost:8765/latest.json"
echo ""
echo "  3. Install Cloudflare Tunnel to expose your Pi:"
echo "     https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/"
echo "     cloudflared tunnel --url http://localhost:8765"
echo ""
echo "  4. Add these env vars to Vercel:"
echo "     SYNC_ENDPOINT_URL = https://your-tunnel.trycloudflare.com/latest.json"
echo "     SYNC_SECRET_TOKEN = (same value as in .env)"
