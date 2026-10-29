# Enquête de Marché — Commerces au Cameroun 🇨🇲 (Architecture Vercel)

Interface web responsive pour la collecte des données d'étude de marché auprès des commerçants camerounais, avec synchronisation en temps réel vers Google Sheets, validation stricte, protection contre les abus et sauvegarde locale hors-ligne.

---

## 🏛️ Architecture Technique Obligatoire (Vercel Exclusif)

Le projet repose sur une architecture 3-tiers robuste éliminant définitivement les problèmes de CORS, garantissant l'intégrité des données et protégeant les identifiants techniques :

```
[Navigateur Client] 
       │
       │  POST /api/submit (Same-Origin, pas de CORS)
       ▼
[Vercel Serverless Function : api/submit.js]
  • Vérification méthode POST & taille (< 64 Ko)
  • Anti-bot Honeypot ('website')
  • Validation stricte des données (Nom, Prénom, Email regex, Ville, Q13 max 3, Q23 max 5)
  • Variable secrète : process.env.GOOGLE_APPS_SCRIPT_URL (serveur uniquement)
  • Timeout contrôlé (20s)
       │
       │  POST HTTPS sécurisé (Serveur à Serveur)
       ▼
[Google Apps Script : Code.gs v2.1]
  • LockService (sérialisation des écritures concurrentes)
  • Idempotence durable via colonne A (Submission_ID)
  • Anti-injection de formules (=, +, -, @)
       │
       ▼
[Google Sheets Privé : Onglet Reponses_Sondage_v2]
  • 53 colonnes structurées (A à BA)
  • Préservation intégrale de l'onglet historique v1
```

---

## 📁 Structure du Projet

```text
├── index.html                  # Formulaire web (HTML5, CSS3, JS vanille, 46 questions, 7 sections)
├── api/
│   └── submit.js               # Endpoint serverless Vercel (/api/submit)
├── vercel.json                 # Configuration Vercel (En-têtes de sécurité, maxDuration)
├── .env.example                # Exemple de variable d'environnement (GOOGLE_APPS_SCRIPT_URL)
├── .gitignore                  # Exclusion des node_modules, .env locaux et logs
├── Code.gs                     # Backend Google Apps Script (v2.1, Reponses_Sondage_v2, LockService)
├── INSTRUCTIONS_GOOGLE_SHEETS.md # Guide de déploiement Apps Script et sécurité
├── README.md                   # Documentation générale et technique
├── test_suite.ps1              # Suite de tests automatisés d'audit et de conformité
└── backup_original/            # Sauvegarde des fichiers initiaux du projet
```

> **Note d'épuration :** Tous les fichiers et références relatifs à Netlify ont été intégralement supprimés. La plateforme de déploiement retenue est exclusivement Vercel.

---

## 🚀 Déploiement sur Vercel

### Option 1 : Déploiement via le Dashboard Vercel (Recommandé)
1. Poussez ce dossier sur un dépôt Git (GitHub, GitLab ou Bitbucket).
2. Connectez-vous sur [vercel.com](https://vercel.com) et cliquez sur **Add New** > **Project**.
3. Importez votre dépôt Git.
4. Dans la section **Environment Variables**, ajoutez :
   - **Key / Name** : `GOOGLE_APPS_SCRIPT_URL`
   - **Value** : `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec`
5. Cliquez sur **Deploy**.

### Option 2 : Déploiement via Vercel CLI
```bash
# Installation de la CLI Vercel si nécessaire
npm i -g vercel

# Connexion et déploiement
vercel

# Configuration de la variable d'environnement de production
vercel env add GOOGLE_APPS_SCRIPT_URL production
# (Coller l'URL du Web App Google Apps Script lorsqu'elle est demandée)

# Déploiement en production
vercel --prod
```

### 🔒 Sécurité de la Variable d'Environnement
- La variable `GOOGLE_APPS_SCRIPT_URL` est accessible **uniquement côté serveur** par Node.js dans `api/submit.js`.
- Elle n'est **jamais** préfixée par `NEXT_PUBLIC_` et n'est **jamais** injectée dans le code HTML/JS du navigateur.
- Si cette variable est absente ou non configurée, l'endpoint `/api/submit` renvoie immédiatement une erreur HTTP 500 explicite (`MISSING_ENV_VAR`) sans faire échouer silencieusement la collecte.

---

## 🔒 Résolution Définitive des Problèmes CORS

### Cause du problème initial
Google Apps Script renvoie une redirection HTTP 302 de `script.google.com` vers `script.googleusercontent.com`. Lors d'un appel `fetch()` direct depuis le navigateur :
- En `mode: "no-cors"`, la réponse est opaque (statut 0, corps illisible). Il était impossible de savoir si Google Sheets avait réellement enregistré les données.
- En `mode: "cors"`, la plupart des navigateurs modernes bloquent la redirection cross-origin, déclenchant une exception TypeError non traitable.

### Solution appliquée
Le formulaire dans `index.html` appelle **exclusivement** l'endpoint same-origin `/api/submit` hébergé sur le même domaine Vercel :
1. Aucune requête cross-origin n'est émise par le navigateur.
2. `api/submit.js` reçoit le payload, le valide et effectue l'appel POST vers Google Apps Script **de serveur à serveur**, environnement où les restrictions CORS du navigateur ne s'appliquent pas.
3. Le serveur Vercel lit la réponse JSON d'Apps Script et ne renvoie un code HTTP 200 au client que si `status === "success"`.
4. En cas de panne, timeout (20s) ou rejet, le bouton est réactivé, une bannière rouge explicite s'affiche et les 46 réponses restent intactes dans le formulaire.

---

## 🛡️ Protection des Données et Versionnement du Schéma

### Nouvel onglet de réponses `Reponses_Sondage_v2`
Pour éviter toute corruption des données antérieures suite à l'ajout de nouvelles colonnes techniques :
- `Code.gs` écrit désormais dans un onglet dédié : **`Reponses_Sondage_v2`**.
- L'ancien onglet historique `Reponses_Sondage` reste **intact et protégé**.
- Une fonction de migration `migrateLegacyV1ToV2()` est intégrée dans `Code.gs` pour migrer les anciennes lignes vers le nouveau schéma sans perte d'information.

### Schéma des 53 Colonnes (A à BA)
1. `Submission_ID` (A) : UUID unique de déduplication
2. `Timestamp_Serveur` (B) : Horodatage certifié par Google Apps Script
3. `Nom` (C)
4. `Prénom` (D)
5. `Email` (E)
6. `Ville` (F)
7. `Consentement_Marketing` (G)
8. `Q1_Ville_Localite` à `Q46_Accord_Recontact` (H à BA)

---

## ⚙️ Protection Anti-Doublons et Idempotence

1. Chaque soumission génère un identifiant cryptographique unique `Submission_ID` côté client.
2. `Code.gs` utilise `LockService.getScriptLock()` pour verrouiller l'accès pendant l'écriture et inspecter la colonne A.
3. Si un `Submission_ID` existe déjà dans la feuille (cas d'un double-clic ou d'un renvoi réseau), le serveur renvoie la confirmation existante avec `duplicate: true`, **sans créer de ligne orpheline en double**.

---

## 🧪 Tests et Validation

La suite [`test_suite.ps1`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/test_suite.ps1) audite l'ensemble de la chaîne :
- Validation de la configuration Vercel (`vercel.json`, `api/submit.js`, `.env.example`).
- Absence totale de dépendances Netlify.
- Intégrité des 46 questions dans `index.html` et de leur transmission.
- Contrôle strict côté serveur (Honeypot, regex email, champs obligatoires, taille maximale).
- Tests d'atomicité, concurrence et idempotence.
