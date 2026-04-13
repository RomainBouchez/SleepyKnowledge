# SleepIQ — Guide d'installation (PWA Next.js)

## Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 14 (App Router) |
| Stockage local | IndexedDB via Dexie.js (offline-first) |
| IA | Claude API (server-side, clé sécurisée) |
| Charts | Recharts |
| Style | Tailwind CSS |
| Hébergement | Vercel |
| Pipeline VPS | Python Playwright + n8n (inchangé) |

---

## 1. Déploiement sur Vercel (< 5 min)

### Fork / clone le repo puis :

```bash
npm install
```

### Sur Vercel :
1. Importe le repo depuis GitHub
2. Dans **Settings → Environment Variables**, ajoute :
   - `CLAUDE_API_KEY` = ta clé Anthropic
   - `SYNC_ENDPOINT_URL` = URL de ton endpoint VPS (optionnel)
   - `SYNC_SECRET_TOKEN` = token auth (optionnel)
3. **Deploy** → l'app est en ligne

### Variables d'environnement locales :

```bash
cp .env.example .env.local
# Édite .env.local avec tes vraies valeurs
npm run dev   # http://localhost:3000
```

---

## 2. Installer sur iPhone (PWA)

1. Ouvre l'URL Vercel dans **Safari** sur iPhone
2. Appuie sur le bouton **Partager** (carré avec flèche)
3. Choisis **"Sur l'écran d'accueil"**
4. Renomme "SleepIQ" → **Ajouter**

L'app apparaît sur l'écran d'accueil comme une app native, en plein écran sans barre Safari.

---

## 3. Icônes PWA

Génère des PNG depuis `public/icon.svg` :

```bash
# Option 1 — avec ImageMagick
convert public/icon.svg -resize 192x192 public/icons/icon-192.png
convert public/icon.svg -resize 512x512 public/icons/icon-512.png

# Option 2 — outil en ligne
# https://realfavicongenerator.net/ ou https://pwa-asset-generator.dev/
```

Place les fichiers dans `public/icons/`.

---

## 4. Données de test

Au premier chargement de l'app, **30 jours de données réalistes** sont automatiquement générés dans IndexedDB (le navigateur). Pour désactiver, retire l'appel `seedTestData()` dans `app/page.tsx`.

Pour réinitialiser : Navigateur → DevTools → Application → IndexedDB → Delete database `sleepiq`.

---

## 5. Pipeline VPS (automatisation Xiaomi)

Le script Python est **inchangé** — il tourne sur ton VPS et envoie les données vers n8n.

```bash
# Sur le VPS
pip install -r scripts/requirements.txt
playwright install chromium && playwright install-deps chromium

# Env vars
export XIAOMI_EMAIL=...
export XIAOMI_PASSWORD=...
export N8N_WEBHOOK_URL=https://n8n.tondomain.com/webhook/sleepiq-sync
export N8N_WEBHOOK_SECRET=...
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...

# Test manuel
python3 scripts/xiaomi_export.py

# Cron (03h00 chaque nuit)
echo "0 3 * * * cd /opt/sleepiq && python3 xiaomi_export.py >> /var/log/sleepiq.log 2>&1" | crontab -
```

### Endpoint de sync

n8n doit servir un fichier JSON accessible par l'app. La façon la plus simple :

```
VPS script → POST n8n webhook → n8n écrit latest.json → nginx serve le fichier
```

**nginx config exemple :**
```nginx
location /sleepiq/latest.json {
    alias /var/www/sleepiq/latest.json;
    add_header Access-Control-Allow-Origin *;  # ou ton domaine Vercel
}
```

Le JSON doit respecter ce format :
```json
{
  "sleep": [
    {
      "date": "2024-01-15",
      "sleep_start": "23:12",
      "sleep_end": "07:34",
      "duration_min": 502,
      "deep_sleep_min": 85,
      "light_sleep_min": 275,
      "rem_sleep_min": 112,
      "awake_min": 30,
      "sleep_score": 78,
      "hr_avg": 56,
      "hr_min": 48,
      "hr_max": 82,
      "steps": 8421
    }
  ],
  "generatedAt": "2024-01-16T03:05:12Z"
}
```

---

## 6. Architecture des fichiers

```
SleepIQ/
├── app/
│   ├── layout.tsx               # Root layout + meta PWA
│   ├── globals.css              # Styles globaux + dark theme
│   ├── page.tsx                 # Dashboard (/, onglet Nuit)
│   ├── chat/page.tsx            # Chat IA avec streaming
│   ├── patterns/page.tsx        # Graphiques + corrélations
│   ├── report/page.tsx          # Rapports hebdomadaires
│   └── api/
│       ├── claude/morning/      # Score matin (Haiku)
│       ├── claude/chat/         # Chat streaming (Sonnet)
│       ├── claude/report/       # Rapport (Sonnet)
│       └── sync/                # Proxy VPS sync
├── components/
│   ├── Navigation.tsx           # Bottom tab bar
│   ├── SleepScoreGauge.tsx      # Jauge SVG animée
│   ├── MetricCard.tsx           # Carte métrique
│   └── LifestyleForm.tsx        # Formulaire plein-écran
├── lib/
│   ├── types.ts                 # Interfaces TypeScript
│   ├── db.ts                    # Dexie (IndexedDB) — CRUD + seed
│   ├── sync.ts                  # Helpers sync (CSV parser, week calc)
│   └── claude-client.ts         # Context builder + fetch wrappers
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── icon.svg                 # Source icône (à convertir en PNG)
│   └── icons/                   # icon-192.png, icon-512.png
├── scripts/
│   ├── xiaomi_export.py         # Script VPS Playwright (inchangé)
│   └── requirements.txt
└── .env.example
```

## 7. Modèles Claude utilisés

| Feature | Modèle | Tokens |
|---|---|---|
| Score du matin | `claude-haiku-4-5-20251001` | 256 |
| Chat (streaming) | `claude-sonnet-4-6` | 1024 |
| Rapport hebdo | `claude-sonnet-4-6` | 1024 |

**Prompt caching** activé sur le system prompt et le contexte 30j → réduit les coûts en cache.
