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
├── test_suite.ps1              # Suite de tests automatisés (audit statique & intégration isolée)
└── backup_original/            # Sauvegarde des fichiers initiaux du projet
```

---

## 🔒 Séparation Stricte entre Tests et Production

Pour préserver l'intégrité de la base de données réelle des commerçants :
1. **Zéro écriture de production par défaut :** Le script `test_suite.ps1` s'exécute par défaut en mode statique et unitaire. Il vérifie l'architecture, la conformité RGPD, les validations de schéma et la logique de l'endpoint sans jamais envoyer de requête vers la base de production.
2. **Garde-fou inviolable :** Si une URL de test passée à `test_suite.ps1` correspond à la signature du déploiement de production (`AKfycbxpGZ9YZ...`), l'exécution des tests d'écriture est immédiatement bloquée.
3. **Données de test 100% fictives :** Aucune vraie coordonnée personnelle n'est utilisée dans les scripts de test (adresses synthétiques `@example.invalid`, noms `ROBOT_TEST_FICTIF`).

### Pour exécuter des tests d'intégration réels (Écriture) :
Créez une feuille Google Sheets de test dédiée et déployez une copie de `Code.gs` :
```powershell
powershell -ExecutionPolicy Bypass -File .\test_suite.ps1 -AllowWriteTests -TestEndpointUrl "https://script.google.com/macros/s/VOTRE_DEPLOYMENT_TEST_ID/exec"
```

---

## 🛡️ Protection de la Vie Privée & Stockage Local Minimisé (RGPD)

Le stockage dans le navigateur (`localStorage`) a été revu pour respecter la vie privée des commerçants :
- **Pas d'accumulation locale :** Le formulaire n'enregistre plus les réponses de manière permanente dans le `localStorage` après une soumission réussie.
- **Purge immédiate du brouillon :** Dès que le serveur Google Sheets confirme l'enregistrement, le brouillon temporaire de travail est immédiatement effacé.
- **Protection partagée multi-utilisateurs :** Lors du clic sur `➕ Remplir une nouvelle réponse`, tous les champs, coches, boutons radio et identifiants sont totalement réinitialisés. Un second répondant sur la même tablette/téléphone ne peut en aucun cas consulter les réponses du précédent.
- **Effacement d'urgence à la demande :** Un bouton rouge `🗑️ Réinitialiser & Effacer les données locales` permet en permanence d'effacer le brouillon et de remettre le formulaire à blanc.

---

## 🚀 Déploiement sur Vercel

### Option 1 : Déploiement via le Dashboard Vercel (Recommandé)
1. Poussez ce dossier sur votre dépôt GitHub (`https://github.com/ledemka/SONDAGE.git`).
2. Rendez-vous sur [vercel.com](https://vercel.com) > **Add New** > **Project**.
3. Importez le projet **`SONDAGE`**.
4. Dans **Environment Variables**, ajoutez :
   - **Key** : `GOOGLE_APPS_SCRIPT_URL`
   - **Value** : `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec`
5. Cliquez sur **Deploy**.

---

## ⚙️ Confirmation Stricte de Soumission & Idempotence

1. **Vérification d'identité :** L'endpoint `api/submit.js` vérifie que le `submission_id` retourné par Apps Script est strictement identique à celui émis.
2. **Preuve d'enregistrement vérifiable :** Le statut de succès n'est accordé que si un numéro de ligne réel (`row > 0`) ou une déduplication confirmée (`duplicate === true`) est retourné.
3. **Persistance de l'ID en cas de timeout :** Si la connexion réseau est ralentie lors de l'envoi, l'identifiant unique reste préservé dans le formulaire. Lors du clic sur `Réessayer l'envoi`, le même ID est réémis : le backend saura s'il doit créer la ligne ou confirmer l'écriture précédente sans doublon.
