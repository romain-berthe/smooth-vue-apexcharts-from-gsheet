Google Sheets data dans un Front via ApexCharts
=================================================

Vue d’ensemble
--------------
Application Vue 3 + ApexCharts pour visualiser des indicateurs à partir d’une feuille Google Sheets.
L’authentification se fait via Google Identity Services (GIS) côté frontend, validée côté backend (Express) qui applique une allowlist (emails/domaines) et pose une session (cookie).

Architecture
------------
- frontend/ (Vite + Vue 3)
  - Affiche les graphiques, gère l’auth GIS
  - Charge les données via le backend (recommandé) ou directement l’API Sheets (mode alternatif)
- backend/ (Express)
  - Vérifie l’ID Token Google, applique l’allowlist
  - Sert de proxy sécurisé vers Google Sheets (Service Account)

Prérequis Google Cloud (API & IAM)
----------------------------------
1) Activer les APIs dans votre projet GCP
- Google Sheets API

2) Créer un identifiant OAuth 2.0 (type « Client Web »)
- Renseigner les « Origins JavaScript autorisés » (ex: http://localhost:5173 en dev, https://kpis.example.com en prod)
- Noter le Client ID (à mettre dans `VITE_GOOGLE_CLIENT_ID` côté front et dans `GOOGLE_CLIENT_IDS` côté back)

3) Créer un Compte de Service (Service Account)
- Générer une clé (format JSON) et récupérer l’email du SA et la clé privée
- Partager votre Google Sheet avec l’email du SA en « Lecteur » (sinon 403/404 côté backend)

4) Récupérer l’ID de votre Spreadsheet (partie entre `/d/` et `/edit` dans l’URL)

Configuration des environnements
--------------------------------

Frontend
- Fichier d’exemple: `frontend/.env.example` (dev) et `frontend/.env.production.example` (prod)
- Copiez vers `frontend/.env` puis ajustez selon l’environnement

Variables obligatoires:
- `VITE_BACKEND_URL`: URL du backend (ex: http://localhost:3001 en dev, https://api.kpis.example.com en prod)
- `VITE_GOOGLE_CLIENT_ID`: Client ID OAuth Web correspondant à l’origine du frontend
- `VITE_SHEETS_MODE`: `backend` (recommandé), `api` ou `csv`

Variables optionnelles:
- `VITE_SHEETS_RANGES`: plage A1 par défaut (ex: A1:Z200)
- `VITE_SHEETS_ID`, `VITE_SHEETS_API_KEY`: uniquement si `VITE_SHEETS_MODE=api`
- `VITE_SHEETS_CSV_URL`: uniquement si `VITE_SHEETS_MODE=csv`
- `VITE_SHEETS_CACHE_TTL_MS`: TTL du cache front (ms) pour le stockage local

Backend
- Fichier d’exemple: `backend/.env.example` (dev) et `backend/.env.production.example` (prod)
- Copiez vers `backend/.env` puis ajustez selon l’environnement

Variables obligatoires:
- `PORT`: port d’écoute (3001 par défaut)
- `NODE_ENV`: `production` en prod (cookies Secure + SameSite=None)
- `GOOGLE_CLIENT_IDS`: liste d’IDs client OAuth autorisés (inclure celui du frontend)
- `SESSION_SECRET`: secret fort pour signer le cookie de session
- `FRONTEND_ORIGIN`: origine du frontend (CORS + cookies). Ex: https://kpis.example.com
- `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`: Compte de service (la clé privée doit conserver les `\n`)
- `SHEETS_ID`: ID du Google Sheet lu par le proxy backend

Variables optionnelles:
- `SHEETS_DEFAULT_RANGE`: plage A1 par défaut (A1:Z200)
- `AUTH_ALLOWED_EMAILS`, `AUTH_ALLOWED_DOMAINS`: allowlist (au moins l’une des deux non vide en prod)

Lancer en développement (sans Docker)
-------------------------------------
Terminal 1 — backend
```
cd backend
npm install
npm run dev
```

Terminal 2 — frontend
```
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:5173

Déploiement avec Docker
-----------------------
1) Préparer les envs
- Copier les fichiers d’exemples de prod:
  - `cp backend/.env.production.example backend/.env`
  - `cp frontend/.env.production.example frontend/.env`
- Renseigner toutes les variables obligatoires (voir sections ci‑dessus)

2) Builder et lancer
```
docker compose build
docker compose up -d
```

3) Accès
- Frontend (Nginx): http://localhost:5173 (ou votre domaine)
- Backend health: http://localhost:3002/healthz

Notes de production
-------------------
- `FRONTEND_ORIGIN` (backend) doit correspondre exactement à l’URL publique du frontend (HTTPS en prod)
- Les cookies de session exigent HTTPS en prod (`Secure` + `SameSite=None`)
- Les variables `VITE_*` sont évaluées au build du frontend: si `VITE_BACKEND_URL` change, rebuild nécessaire
- Si vous êtes derrière un reverse proxy, exposez 443 au public et laissez Nginx servir l’app en interne

Déploiement derrière un reverse proxy (Nginx / HAProxy / NPM)
------------------------------------------------------------
- DNS: créez 2 enregistrements pointant vers votre NAS
  - `kpis.votre-domaine` (frontend)
  - `api.kpis.votre-domaine` (backend)
- Frontend (upstream interne): le conteneur Nginx sert sur `80`, mappé par défaut sur l’hôte `5173` (`5173:80`).
- Proxy → `http://NAS_LAN_IP:5173` (ou directement `kpis-frontend:80` si le proxy est sur le même réseau Docker)
- Backend (upstream interne): l’API écoute sur `3002`.
- Proxy → `http://NAS_LAN_IP:3002` (ou `kpis-backend:3002` si même réseau)
- TLS: terminez le HTTPS au niveau du reverse proxy (Let’s Encrypt) et proxifiez en HTTP vers les conteneurs.
- Envs critiques backend (fichier `backend/.env`):
  - `NODE_ENV=production`
  - `PORT=3002`
  - `FRONTEND_ORIGIN=https://kpis.votre-domaine`
  - `GOOGLE_CLIENT_IDS=<même Client ID que VITE_GOOGLE_CLIENT_ID>`
  - `AUTH_ALLOWED_EMAILS` ou `AUTH_ALLOWED_DOMAINS` (allowlist obligatoire en prod)
- Envs frontend (fichier `frontend/.env`, évalué au build):
  - `VITE_BACKEND_URL=https://api.kpis.votre-domaine`
  - `VITE_GOOGLE_CLIENT_ID=<Client ID OAuth Web>`
  - Rebuild requis après changement: `docker compose build --no-cache frontend && docker compose up -d frontend`
- Backend: l’application est derrière un proxy TLS, `trust proxy` est activé pour que les cookies `Secure` soient bien émis.

Nginx Proxy Manager (exemple)
- Hôte `kpis.votre-domaine`
  - Forward Host: `NAS_LAN_IP`, Forward Port: `5173`, Scheme: `http`
  - SSL: certificat Let’s Encrypt
- Hôte `api.kpis.votre-domaine`
  - Forward Host: `NAS_LAN_IP`, Forward Port: `3002`, Scheme: `http`
  - SSL: certificat Let’s Encrypt
- Onglet Advanced (si nécessaire):
  - `proxy_set_header Host $host;`
  - `proxy_set_header X-Forwarded-Proto $scheme;`

Dépannage proxy
- 504 Gateway Time-out: l’upstream ciblé est erroné (ex: IP conteneur avec port 5173 → utiliser port 80 si IP conteneur, ou `NAS_IP:5173` si port publié).
- 401 après login: cookie non posé. Vérifier `FRONTEND_ORIGIN` (https), `NODE_ENV=production`, et que le proxy transmet `Host`/`X-Forwarded-Proto`. Le backend pose un cookie `Secure; SameSite=None` (HTTPS requis).
- 403 sur `/auth/google`: adresse email/domaine non autorisé → renseigner `AUTH_ALLOWED_EMAILS`/`AUTH_ALLOWED_DOMAINS` et recréer le backend.
- Audience invalide (401): `GOOGLE_CLIENT_IDS` doit contenir exactement `VITE_GOOGLE_CLIENT_ID`.
- Vérification rapide CORS (préflight):
  - `curl -i -X OPTIONS https://api.kpis.votre-domaine/auth/google -H "Origin: https://kpis.votre-domaine" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
  - Attendu: `Access-Control-Allow-Origin: https://kpis.votre-domaine` et `Access-Control-Allow-Credentials: true`.

Données Google Sheets — modes de lecture
----------------------------------------
- Mode backend (recommandé): lecture via le backend avec Compte de Service (secrets côté serveur)
- Mode api: lecture directe depuis le navigateur (clé API exposée) — éviter en prod
- Mode csv: lecture d’un CSV publié — utile pour un dump statique

Dépannage
---------
- 401 Unauthorized sur `/auth/me` ou `/sheets/values`
  - Cookie non posé (CORS/FRONTEND_ORIGIN incorrect), ou non-HTTPS en prod
- 403 `Account not allowed` après login
  - Email/domain non présent dans `AUTH_ALLOWED_EMAILS`/`AUTH_ALLOWED_DOMAINS`
- Audience/Client ID invalide
  - `GOOGLE_CLIENT_IDS` ne contient pas le `VITE_GOOGLE_CLIENT_ID` du frontend
- Sheets 403/404
  - La feuille n’est pas partagée avec `GOOGLE_SA_EMAIL`, ou `SHEETS_ID` incorrect

Questions / améliorations
-------------------------
- Injection runtime des `VITE_*` (au lieu de rebuild) possible si besoin
- Ajout de headers de cache/gzip dans `frontend/nginx.conf` si nécessaire
