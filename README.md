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
  • Exigence absolue d'un submission_id valide
  • Anti-bot Honeypot ('website')
  • Validation stricte des données (Nom, Prénom, Email regex, Ville, Q13 max 3, Q23 max 5)
  • Variable secrète : process.env.GOOGLE_APPS_SCRIPT_URL (serveur uniquement)
  • Timeout contrôlé (20s)
  • Contrôle d'intégrité : rejet immédiat si le submission_id retourné est absent ou différent
       │
       │  POST HTTPS sécurisé (Serveur à Serveur)
       ▼
[Google Apps Script : Code.gs v2.1]
  • LockService (sérialisation des écritures concurrentes)
  • Idempotence durable via colonne A (Submission_ID)
  • Suppression du probing public doGet(?action=verify) pour préserver la confidentialité
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
├── .env.example                # Exemple de variable d'environnement sans secret (GOOGLE_APPS_SCRIPT_URL)
├── .gitignore                  # Exclusion des node_modules, .env locaux et logs
├── Code.gs                     # Backend Google Apps Script (v2.1, Reponses_Sondage_v2, LockService)
├── INSTRUCTIONS_GOOGLE_SHEETS.md # Guide de déploiement Apps Script et sécurité
├── README.md                   # Documentation générale et technique
├── test_suite.ps1              # Suite de tests automatisés (audit statique & intégration isolée)
└── ENQUETE_MARCHE_PRODUCTION.zip # Archive ZIP livrable pour déploiement
```

---

## 📋 Statut de Validation : Ce qui a été testé vs. Étapes restantes

### ✅ ÉTAPES TESTÉES ET CERTIFIÉES DANS LE CODE SOURCE :
1. **Architecture Vercel pure :** Dossier `netlify/` purgé, configuration `vercel.json` et endpoint `api/submit.js` validés.
2. **Élimination du risque CORS :** Le navigateur appelle exclusivement `/api/submit` en same-origin.
3. **Validation stricte d'identité & intégrité :**
   - `submission_id` obligatoire avant toute transmission à Google Apps Script.
   - Rejet formel (HTTP 502) si le `submission_id` retourné par Apps Script est manquant ou différent de celui envoyé.
4. **Suppression de tout risque de sondage (probing) :** L'endpoint `doGet(?action=verify)` a été retiré de `Code.gs` afin qu'aucun tiers ne puisse tester ou sonder les identifiants enregistrés.
5. **Conformité RGPD et vie privée (`localStorage`) :**
   - Aucune accumulation permanente des réponses personnelles des commerçants dans le navigateur.
   - Purge automatique immédiate du brouillon dès confirmation de l'enregistrement.
   - Réinitialisation complète pour tout nouvel utilisateur (`resetFormForNewRespondent()`).
   - Bouton d'effacement manuel immédiat pour les enquêteurs terrain.
6. **Zéro pollution de production par défaut :**
   - `test_suite.ps1` ne contient aucune URL de production codée en dur.
   - Garde-fou automatique empêchant toute écriture si l'URL correspond à la production.
   - 12 tests statiques et unitaires exécutés avec succès sans toucher à la base de données.

---

### ⏳ ÉTAPES RESTANT À EFFECTUER MANUELLEMENT PAR L'ADMINISTRATEUR :

1. **Déploiement de `Code.gs` v2.1 sur Google Apps Script :**
   - Ouvrir la feuille de production : [Accéder à la feuille Google Sheets](https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit?usp=sharing).
   - Menu **Extensions** > **Apps Script**, coller le code de `Code.gs`.
   - **Déployer** > **Gérer les déploiements** > Modifier ✏️ > sélectionner **« Nouvelle version »** > **Déployer**.
   *(Tant que cette nouvelle version n'est pas publiée, l'ancien script déployé continuera d'exécuter la v1.0).*

2. **Configuration Vercel en production :**
   - Sur votre projet Vercel ([vercel.com](https://vercel.com)), aller dans **Settings** > **Environment Variables**.
   - Ajouter la variable serveur :
     - `GOOGLE_APPS_SCRIPT_URL` = `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec`
   - Redéployer pour activer la variable.

3. **(Optionnel) Validation d'écriture sur un environnement de test isolé :**
   - Créer une feuille de test vierge dans Google Drive.
   - Y déployer une copie de `Code.gs`.
   - Lancer :
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\test_suite.ps1 -AllowWriteTests -TestEndpointUrl "https://script.google.com/macros/s/VOTRE_URL_DE_TEST/exec"
     ```

---

## 🔒 Sécurité et Protection contre les Faux Succès

- **Pas d'effet d'illusion :** Le message de confirmation vert avec le numéro de ligne ne s'affiche que si :
  1. Le code HTTP retourné par `/api/submit` est 200.
  2. Le champ `status` vaut explicitement `"success"`.
  3. L'identifiant `submission_id` retourné est validé.
  4. Le serveur Apps Script a certifié une ligne d'écriture (`row > 0`) ou un doublon avéré (`duplicate: true`).
- **En cas de panne ou timeout (25s) :**
  - Un bandeau rouge explicite s'affiche sans quitter le formulaire.
  - Le bouton est réactivé (`Réessayer l'envoi`).
  - L'identifiant de soumission est conservé tel quel (pour que l'idempotence fonctionne sur le renvoi).
  - Un bouton de téléchargement CSV d'urgence permet de sauver la saisie actuelle.
