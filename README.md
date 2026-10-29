# Enquête de Marché — Commerces au Cameroun 🇨🇲 (Architecture Vercel)

Interface web responsive pour la collecte des données d'étude de marché auprès des commerçants camerounais (46 questions), complétée par un **Dashboard KPI de pilotage décisionnel** (`/dashboard`), avec synchronisation en temps réel vers Google Sheets, validation stricte et anonymisation à la source.

---

## 🏛️ Architecture Technique Globale

Le projet repose sur une architecture 3-tiers robuste hébergée exclusivement sur Vercel :

```text
[Formulaire Répondants : index.html]          [Dashboard Décisionnel : /dashboard]
               │                                                 │
               │ POST /api/submit                                │ GET /api/dashboard
               ▼                                                 ▼
[Vercel Serverless Function : api/submit.js]   [Vercel Serverless Function : api/dashboard.js]
  • Anti-bot Honeypot                            • Authentification Bearer / Mot de passe
  • Validation stricte submission_id             • Cache mémoire (TTL 60s)
  • Contrôle intégrité & déduplication           • ZÉRO PII (Données personnelles purgées)
  • Timeout 20s                                  • Agrégations & métriques en temps réel
               │                                                 │
               │ POST (Écriture atomique)                        │ GET action=read_analytics (Lecture)
               └─────────────────────────┬───────────────────────┘
                                         ▼
                   [Google Apps Script : Code.gs v2.2]
                     • LockService (sérialisation des écritures concurrentes)
                     • Idempotence durable via colonne A (Submission_ID)
                     • Clé secrète d'accès analytique (DASHBOARD_API_KEY)
                     • Anonymisation à la source (Nom, Prénom, Email exclus)
                                         │
                                         ▼
                   [Google Sheets Privé : Onglet Reponses_Sondage_v2]
                     • 53 colonnes structurées (A à BA)
                     • Classeur 100% privé (aucun partage public)
```

---

## 📁 Structure des Livrables

```text
├── index.html                  # Formulaire web (46 questions, 7 sections, responsive mobile)
├── dashboard.html              # Dashboard de pilotage KPI (/dashboard, Chart.js 4, filtres)
├── api/
│   ├── submit.js               # Endpoint de collecte (/api/submit)
│   └── dashboard.js            # Endpoint analytique agrégé (/api/dashboard, auth, zéro PII)
├── vercel.json                 # Configuration Vercel (En-têtes de sécurité, maxDuration 30s)
├── .env.example                # Variables d'environnement requises sans secrets
├── Code.gs                     # Backend Google Apps Script (v2.2, Reponses_Sondage_v2, Analytics)
├── DATA_DICTIONARY.md          # Dictionnaire des 53 colonnes et usages analytiques
├── KPI_FORMULAS.md             # Formules de calcul des KPI, dénominateurs et règles
├── test_dashboard.js           # Suite de tests unitaires et analytiques du dashboard (10 tests)
├── test_suite.ps1              # Audit global automatisé (18 tests de conformité Vercel & GAS)
├── INSTRUCTIONS_GOOGLE_SHEETS.md # Guide de déploiement Apps Script et sécurité
└── README.md                   # Documentation générale et technique
```

---

## 📊 Fonctionnalités du Dashboard KPI (`/dashboard`)

1. **Cartes d'Indicateurs Clés (KPI Summary)** :
   - Total des réponses valides ($N_{valide}$).
   - Taux de complétion global ($\ge 35$ questions renseignées).
   - Taux d'intérêt pour tester une version pilote (Q41).
   - Propension à payer court terme (Q42).
   - Taux d'accord formel pour recontact commercial (Q46).
2. **Visualisations Dédiées** :
   - **Problématiques (Q13)** : Barres horizontales classant les difficultés par fréquence et % de répondants.
   - **Gravité des Incidents** : Fréquence des ruptures de stock (Q15), erreurs d'inventaire (Q14), flou sur le bénéfice (Q16), écarts de caisse (Q17), oublis de crédits clients (Q18) et pertes financières confirmées (Q22).
   - **Besoins Fonctionnels (Q23 & Q25)** : Fonctionnalités les plus demandées et widgets smartphone prioritaires.
   - **Entonnoir de Conversion Commercial** : Utilité perçue $\rightarrow$ Intention $\rightarrow$ Pilote $\rightarrow$ Prêt à payer $\rightarrow$ Recontact.
   - **Sensibilité Prix & Paiement (Q36 & Q37)** : Tranches de budget mensuel acceptable en FCFA et modes de paiement préférés.
   - **Segmentation Commerçants** : Répartition géographique par Ville (Q1) et sectorielle (Q2).
   - **Timeline Quotidienne** : Courbe du nombre de réponses collectées par jour.
3. **Filtres Dynamiques Interactifs** :
   - Filtrage instantané par **Ville**, par **Secteur d'activité** et par **Période** (7j, 30j, Tout).
4. **Sécurité & Confidentialité** :
   - Accès protégé par mot de passe côté serveur (`DASHBOARD_PASSWORD`).
   - Aucune fuite de données personnelles : `nom`, `prenom`, `email` ne sont jamais transmis.
   - Le classeur Google Sheets reste strictement privé.

---

## ⚙️ Configuration des Variables d'Environnement (Vercel)

Dans les paramètres de votre projet Vercel (**Settings** > **Environment Variables**) :

| Variable | Description | Exemple |
|---|---|---|
| `GOOGLE_APPS_SCRIPT_URL` | URL de déploiement de la Web App Google Apps Script | `https://script.google.com/macros/s/.../exec` |
| `DASHBOARD_PASSWORD` | Mot de passe pour déverrouiller `/dashboard` | `MonMotDePasseAdmin2026!` |
| `DASHBOARD_API_KEY` | Clé secrète partagée avec Apps Script pour `action=read_analytics` | `cm_sondage_analytics_secret_2026` |

---

## 🚀 Procédure de Déploiement

### Étape 1 : Mettre à jour Google Apps Script (`Code.gs` v2.2)
1. Ouvrez votre classeur Google Sheets : [Lien du classeur](https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit?usp=sharing).
2. Cliquez sur **Extensions** > **Apps Script**.
3. Remplacez l'intégralité du code par le contenu de [Code.gs](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/Code.gs).
4. Cliquez sur **Déployer** > **Gérer les déploiements** > Icône Crayon ✏️ > Version : **« Nouvelle version »** > **Déployer**.

### Étape 2 : Déployer sur Vercel
1. Pousser les modifications sur votre dépôt GitHub : `git push origin main`.
2. Vercel déclenche le déploiement automatique.
3. Accédez à votre formulaire sur `https://votre-app.vercel.app/`.
4. Accédez à votre dashboard de pilotage sur `https://votre-app.vercel.app/dashboard`.

---

## 🧪 Validation & Tests Automatisés

Pour exécuter la suite d'audit complète (18 tests) :

```powershell
powershell -ExecutionPolicy Bypass -File .\test_suite.ps1
```

Résultats certifiés :
- **14/14 tests statiques et unitaires PASS** (Architecture Vercel, sécurité, RGPD, rejet d'invalides, zéro PII, déduplication des choix multiples, calculs KPI).
- **4 tests d'écriture ignorés/protégés** par le garde-fou pour préserver la base de données de production.
