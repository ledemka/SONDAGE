# Guide de Déploiement Google Apps Script & Sécurisation (Vercel Backend)

Ce guide détaille la mise en production du backend Google Apps Script pour l'enquête auprès des commerçants camerounais, la sécurisation de la feuille Google Sheets, la mise en place d'un environnement de test isolé et la configuration des variables d'environnement sur Vercel.

---

## ⚠️ AVERTISSEMENT DE SÉCURITÉ & CONFIDENTIALITÉ (RGPD / DONNÉES PRIVÉES)

> [!CAUTION]
> **NE JAMAIS RENDRE VOTRE FEUILLE GOOGLE SHEETS PUBLIQUE !**
> La feuille recueille des données professionnelles et personnelles sensibles (noms, prénoms, emails, numéros WhatsApp, chiffres d'affaires, dettes clients et estimations de pertes financières).
> 
> Grâce à l'architecture Vercel + Google Apps Script déployée en mode **« Exécuter en tant que : Moi »**, le script dispose des droits d'écriture sur votre feuille **sans que la feuille n'ait besoin d'être partagée avec le public**.
> 
> **Votre feuille Google Sheets doit rester strictement PRIVÉE (Accès général : Limité). Seul votre compte propriétaire doit y avoir accès.**

---

## 1. Mise à Jour Obligatoire du Script sur la Feuille de Production

Votre feuille Google Sheets de production est accessible à l'adresse suivante :  
👉 **[Accéder à votre feuille Google Sheets de Production](https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit?usp=sharing)**

### Étape 1 : Remplacer le code dans Apps Script
1. Ouvrez votre feuille Google Sheets.
2. Cliquez sur le menu **Extensions** > **Apps Script**.
3. Sélectionnez l'intégralité du code existant dans l'éditeur (`Code.gs`) et supprimez-le.
4. Ouvrez le fichier **[`Code.gs`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/Code.gs)** de ce projet.
5. Copiez l'intégralité de son contenu et collez-le dans l'éditeur Google Apps Script.
6. Cliquez sur l'icône **Enregistrer** (disquette) ou tapez `Ctrl + S`.

### Étape 2 : Publier une NOUVELLE VERSION du déploiement
> [!IMPORTANT]
> Modifier le code dans l'éditeur Google Apps Script ne met **pas** à jour l'application web en ligne automatiquement. Il est indispensable de publier une **« Nouvelle version »**.

1. En haut à droite de l'éditeur Apps Script, cliquez sur **Déployer** > **Gérer les déploiements** (Manage deployments).
2. Cliquez sur l'icône **Crayon ✏️ (Modifier)** en haut à droite.
3. Dans la liste déroulante **Version**, sélectionnez : **« Nouvelle version »** (New version).
4. Description : `Version 2.1 - Vercel Relay, Reponses_Sondage_v2, LockService, Strict Idempotence`.
5. Vérifiez les paramètres d'accès :
   - **Exécuter en tant que :** `Moi (<votre email>)`
   - **Qui a accès :** **`Tous les utilisateurs`** (Anyone)
6. Cliquez sur **Déployer**.
7. L'URL Web App de production reste identique :  
   `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec`

---

## 2. Création d'un Environnement de Test Isolé (Optionnel)

Pour tester des écritures automatisées sans jamais polluer la feuille de production :

1. Dans Google Drive, créez une **nouvelle feuille Google Sheets** vierge nommée `Enquete_Marche_TEST`.
2. Ouvrez cette feuille > **Extensions** > **Apps Script**.
3. Collez-y le contenu de [`Code.gs`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/Code.gs).
4. Cliquez sur **Déployer** > **Nouveau déploiement** > Type : **Application Web**.
5. Paramètres :
   - Description : `Environnement de Test Isolé`
   - Exécuter en tant que : `Moi`
   - Qui a accès : `Tous les utilisateurs`
6. Copiez l'URL Web App générée (qui aura un identifiant différent de la production).
7. Lancez la suite de tests d'écriture sur cette URL isolée :
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\test_suite.ps1 -AllowWriteTests -TestEndpointUrl "https://script.google.com/macros/s/VOTRE_URL_DE_TEST/exec"
   ```

---

## 3. Configuration de la Variable d'Environnement sur Vercel

Sur Vercel, l'URL du script n'est jamais exposée au navigateur : elle est lue par la Serverless Function `api/submit.js`.

1. Rendez-vous sur votre projet sur le tableau de bord **Vercel** (`https://vercel.com`).
2. Allez dans **Settings** > **Environment Variables**.
3. Créez une nouvelle variable :
   - **Key** : `GOOGLE_APPS_SCRIPT_URL`
   - **Value** : `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec`
   - **Environments** : Cochez *Production*, *Preview*, et *Development*.
4. Cliquez sur **Save**.
5. Relancez un déploiement (**Redeploy**) pour que la nouvelle variable soit injectée.

---

## 4. Schéma des 53 Colonnes (Onglet `Reponses_Sondage_v2`)

| Colonne | En-tête | Description & Type |
|---|---|---|
| **A** | `Submission_ID` | UUID unique pour l'idempotence et l'anti-doublon |
| **B** | `Timestamp_Serveur` | Horodatage certifié par Google Apps Script (ISO 8601) |
| **C** | `Nom` | Nom du commerçant (Obligatoire) |
| **D** | `Prénom` | Prénom du commerçant (Obligatoire) |
| **E** | `Email` | Adresse email validée par regex (Obligatoire) |
| **F** | `Ville` | Ville principale de l'activité (Obligatoire) |
| **G** | `Consentement_Marketing` | Consentement séparé pour futures communications (Oui / Non) |
| **H** | `Q1_Ville_Localite` | Q1 : Ville ou localité exacte (+ précision si Autre) |
| **I** | `Q2_Type_Commerce` | Q2 : Type d'activité commerciale |
| **J** | `Q3_Anciennete` | Q3 : Ancienneté du commerce |
| **K** | `Q4_Effectif` | Q4 : Effectif employé |
| **L** | `Q5_Points_De_Vente` | Q5 : Nombre de points de vente |
| **M** | `Q6_Role` | Q6 : Fonction du répondant |
| **N** | `Q7_Enregistrement_Ventes` | Q7 : Suivi des ventes actuelles |
| **O** | `Q8_Suivi_Stocks` | Q8 : Suivi des stocks |
| **P** | `Q9_Frequence_Inventaire` | Q9 : Fréquence de l'inventaire |
| **Q** | `Q10_Calcul_Benefices` | Q10 : Méthode de calcul des marges |
| **R** | `Q11_Suivi_Credits` | Q11 : Gestion des dettes et crédits clients |
| **S** | `Q12_Moyens_Paiement` | Q12 : Moyens de paiement acceptés |
| **T** | `Q13_Principales_Difficultes` | Q13 : 3 principales difficultés rencontrées (max 3) |
| **U** | `Q14_Erreurs_Stocks` | Q14 : Fréquence des écarts d'inventaire |
| **V** | `Q15_Ruptures_Stocks` | Q15 : Fréquence des ruptures de stock |
| **W** | `Q16_Difficulte_Benefice` | Q16 : Difficulté d'évaluation du bénéfice |
| **X** | `Q17_Ecart_Recettes_Caisse` | Q17 : Différences de caisse inexpliquées |
| **Y** | `Q18_Oubli_Dette_Client` | Q18 : Oublis d'échéances ou crédits impayés |
| **Z** | `Q19_Temps_Quotidien_Gestion`| Q19 : Temps passé à la gestion quotidienne |
| **AA** | `Q20_Difficulte_Impact_Max` | Q20 : Difficulté avec le plus d'impact + justification |
| **AB** | `Q21_Exemple_Recent_Perte` | Q21 : Exemple récent de perte ou erreur |
| **AC** | `Q22_Perte_Argent_3Mois` | Q22 : Estimation des pertes financières sur 3 mois |
| **AD** | `Q23_Fonctionnalites_Utiles` | Q23 : Fonctionnalités prioritaires recherchées (max 5) |
| **AE** | `Q24_Probleme_Prioritaire` | Q24 : Problème à résoudre en priorité |
| **AF** | `Q25_Infos_Smartphone` | Q25 : Informations souhaitées sur smartphone |
| **AG** | `Q26_Appareil_Prefere` | Q26 : Appareil de travail préféré |
| **AH** | `Q27_Mode_Hors_Ligne_Requis` | Q27 : Importance de l'accès hors ligne |
| **AI** | `Q28_Utilisateurs_Logiciel` | Q28 : Nombre d'utilisateurs prévus |
| **AJ** | `Q29_Logiciel_Actuel` | Q29 : Utilisation d'un logiciel aujourd'hui (+ nom) |
| **AK** | `Q30_Cout_Actuel` | Q30 : Coût des outils actuels |
| **AL** | `Q31_Points_Forts_Actuels` | Q31 : Points forts des outils actuels |
| **AM** | `Q32_Points_Faibles_Actuels` | Q32 : Points faibles des outils actuels |
| **AN** | `Q33_Raison_Non_Utilisation`| Q33 : Raison principale de non-utilisation |
| **AO** | `Q34_Utilite_Percue` | Q34 : Intérêt perçu pour une application dédiée |
| **AP** | `Q35_Intention_Utilisation` | Q35 : Intention réelle d'utilisation |
| **AQ** | `Q36_Mode_Paiement_Prefere` | Q36 : Fréquence de paiement préférée |
| **AR** | `Q37_Prix_Mensuel_Acceptable` | Q37 : Prix acceptable / mois |
| **AS** | `Q38_Prix_Trop_Cher` | Q38 : Prix jugé trop cher (bloquant) |
| **AT** | `Q39_Prix_Trop_Bas_Douteux` | Q39 : Prix trop bas (qualité douteuse) |
| **AU** | `Q40_Accord_Abonnement` | Q40 : Avis sur le principe de l'abonnement |
| **AV** | `Q41_Pret_A_Tester_Version_Pilote` | Q41 : Volonté de tester la version pilote |
| **AW** | `Q42_Pret_A_Payer_Prochaines_Semaines` | Q42 : Décision d'achat dans les prochaines semaines |
| **AX** | `Q43_Decideur_Achat` | Q43 : Décideur de l'achat |
| **AY** | `Q44_Accompagnement_Souhaite` | Q44 : Type d'accompagnement souhaité (formation, etc.) |
| **AZ** | `Q45_Motif_Refus` | Q45 : Si non intéressé, motif principal |
| **BA** | `Q46_Accord_Recontact` | Q46 : Accord d'être recontacté (+ Téléphone) |
