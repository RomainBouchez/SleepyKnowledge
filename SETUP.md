# SleepIQ — Guide d'installation

## Prérequis

- **macOS** avec Xcode 15+ installé (pour iOS)
- **Node.js** 18+ et npm
- **CocoaPods** : `sudo gem install cocoapods`
- **Clé API Claude** : https://console.anthropic.com/

---

## 1. Initialiser le projet React Native Bare

```bash
# Depuis le dossier du repo
npx @react-native-community/cli init SleepIQ --template react-native-template-typescript --directory .

# (accepte d'écraser App.tsx — on a déjà la nôtre)
```

> **Alternative sans réinitialiser** : si le projet est déjà initialisé (android/ et ios/ présents),
> passe directement à l'étape 2.

---

## 2. Installer les dépendances JS

```bash
npm install
```

---

## 3. Pods iOS

```bash
cd ios && pod install && cd ..
```

---

## 4. Configurer les variables d'environnement

```bash
cp .env.example .env
# Édite .env et remplis CLAUDE_API_KEY
```

Pour que `react-native-config` lise le `.env` :
- **iOS** : les variables sont automatiquement injectées à la compilation.
- Assure-toi que `react-native-config` est dans `Podfile` (ajouté via `pod install`).

---

## 5. Configurer react-native-vector-icons (iOS)

Dans `ios/<AppName>/Info.plist`, ajoute les polices :

```xml
<key>UIAppFonts</key>
<array>
  <string>MaterialIcons.ttf</string>
  <string>Ionicons.ttf</string>
</array>
```

Et dans `Podfile` (avant `pod install`) :

```ruby
pod 'RNVectorIcons', :path => '../node_modules/react-native-vector-icons'
```

---

## 6. Configurer react-native-sqlite-storage (iOS)

```ruby
# Podfile
pod 'react-native-sqlite-storage', :path => '../node_modules/react-native-sqlite-storage'
```

Relance `pod install` si tu l'as ajouté manuellement.

---

## 7. Lancer l'app

```bash
# Démarrer Metro
npm start

# Dans un autre terminal
npm run ios
```

L'app se lancera avec **30 jours de données de test** générées automatiquement.
Pour désactiver le seed de test, commente la ligne `await seedTestData()` dans `App.tsx`.

---

## 8. Pipeline VPS (automatisation Xiaomi)

### Setup sur le VPS (AlmaLinux + Docker)

```bash
# Créer le dossier du script
mkdir -p /opt/sleepiq && cd /opt/sleepiq
cp /path/to/SleepIQ/scripts/xiaomi_export.py .
cp /path/to/SleepIQ/scripts/requirements.txt .

# Installer les dépendances Python
pip3 install -r requirements.txt
playwright install chromium
playwright install-deps chromium

# Configurer les variables d'environnement
cat > /etc/sleepiq.env << 'EOF'
XIAOMI_EMAIL=ton@email.com
XIAOMI_PASSWORD=ton_mot_de_passe
N8N_WEBHOOK_URL=https://n8n.tondomain.com/webhook/sleepiq-sync
N8N_WEBHOOK_SECRET=un_secret_token
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
EOF
chmod 600 /etc/sleepiq.env
```

### Première connexion (session cookie)

```bash
# Lance une fois en interactif pour sauvegarder les cookies
cd /opt/sleepiq
source /etc/sleepiq.env
python3 xiaomi_export.py
```

### Cron job (03h00 chaque nuit)

```bash
crontab -e
# Ajouter :
0 3 * * * source /etc/sleepiq.env && /usr/bin/python3 /opt/sleepiq/xiaomi_export.py >> /var/log/sleepiq.log 2>&1
```

---

## 9. Workflow n8n

Le script poste un JSON à ton webhook n8n. Crée un workflow n8n simple :

```
Webhook trigger
  ↓
Code node (validation du payload)
  ↓
HTTP Request node  ←  Stocke le JSON dans un endpoint ou fichier Nextcloud
  ↓
(optionnel) Telegram notification "Données de nuit synchronisées ✓"
```

### Endpoint de l'app

L'app mobile poll l'URL `SYNC_ENDPOINT_URL` via le bouton "↓ Sync" (swipe down sur le dashboard).
Cette URL doit retourner le JSON au format :

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

**Option simple** : n8n écrit ce JSON dans un fichier sur ton VPS (via SSH/SFTP node),
servi par nginx avec une auth basic. L'app fetch ce fichier.

---

## 10. Notifications push (optionnel)

Pour les alertes (rapport du lundi, session expirée), intègre :

```bash
npm install @notifee/react-native
# puis
cd ios && pod install && cd ..
```

Configure Notifee dans `App.tsx` pour programmer une notification locale
chaque lundi matin au démarrage de l'app (via `isMonday()` du sync service).

---

## Architecture des fichiers

```
SleepIQ/
├── App.tsx                          # Entrée app + init SQLite
├── index.js                         # AppRegistry
├── src/
│   ├── types/index.ts               # Interfaces TypeScript
│   ├── theme/index.ts               # Couleurs, typographie, styles partagés
│   ├── services/
│   │   ├── database.ts              # SQLite — CRUD + seed data
│   │   ├── claude.ts                # Appels Claude API (score, chat, rapport)
│   │   └── sync.ts                  # Sync depuis VPS + parsing CSV
│   ├── navigation/AppNavigator.tsx  # Bottom tab navigator
│   ├── components/
│   │   ├── SleepScoreGauge.tsx      # Jauge animée SVG
│   │   ├── MetricCard.tsx           # Carte métrique réutilisable
│   │   └── LifestyleForm.tsx        # Modal formulaire soir
│   └── screens/
│       ├── DashboardScreen.tsx      # Score + métriques + form lifestyle
│       ├── ChatScreen.tsx           # Chat libre avec streaming
│       ├── PatternsScreen.tsx       # Graphiques + corrélations
│       └── ReportScreen.tsx         # Rapports hebdomadaires
├── scripts/
│   ├── xiaomi_export.py             # Script VPS (Playwright)
│   └── requirements.txt
└── .env.example                     # Template variables d'environnement
```

---

## Stack Claude API utilisée

| Fonctionnalité | Modèle | Notes |
|---|---|---|
| Score matin | `claude-haiku-4-5-20251001` | Rapide, économique — 256 tokens max |
| Chat libre | `claude-sonnet-4-6` | Streaming, 1024 tokens max |
| Rapport hebdo | `claude-sonnet-4-6` | One-shot, 1024 tokens max |

**Prompt caching** activé sur :
- Le système prompt (chat + rapport)
- Le contexte 30 jours (injecté dans le chat)

Cela réduit significativement les coûts en réutilisant le cache entre messages du même chat.

---

## Données de test

Au premier lancement, 30 jours de données réalistes sont auto-générés :
- Durée : 4–8h selon les nuits (20% de mauvaises nuits)
- Deep sleep : 15–25% (8–16% les mauvaises nuits)
- Facteurs lifestyle variés (caféine, sport, weed, repas)

Pour réinitialiser : supprime l'app du simulateur et relance, ou ajoute une function `clearDatabase()` dans la console.
