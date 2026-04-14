#!/usr/bin/env python3
"""
SleepIQ — HTTP server for Raspberry Pi
========================================
Serves data/latest.json so Vercel can fetch sleep data via SYNC_ENDPOINT_URL.

Usage:
    python3 serve.py           # listens on port 8765

Systemd service: see setup_rpi.sh
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT       = int(os.environ.get("SERVE_PORT", 8765))
DATA_DIR   = Path(__file__).parent / "data"
LATEST     = DATA_DIR / "latest.json"
SECRET     = os.environ.get("SYNC_SECRET_TOKEN", "")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default access log noise; errors still print
        pass

    def do_GET(self):
        if self.path not in ("/", "/latest.json"):
            self.send_response(404)
            self.end_headers()
            return

        # Optional token auth
        if SECRET:
            token = self.headers.get("X-SleepIQ-Token", "")
            if token != SECRET:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error":"Unauthorized"}')
                return

        if not LATEST.exists():
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"No data yet - run xiaomi_export.py first"}')
            return

        data = LATEST.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    DATA_DIR.mkdir(exist_ok=True)
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SleepIQ server listening on port {PORT}")
    print(f"Serving: {LATEST}")
    server.serve_forever()
