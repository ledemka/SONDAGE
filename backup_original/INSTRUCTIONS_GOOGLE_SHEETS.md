# Guide d'Intégration Google Sheets & Déploiement

Votre feuille Google Sheets dédiée et votre Webhook sont configurés :  
👉 **[Accéder à votre feuille Google Sheets](https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit?usp=sharing)**  
⚡ **URL Web App connectée :** `https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec` (déjà intégrée dans `index.html`)

---

## 1. Mise en place du Webhook sur votre Feuille (2 minutes)

Pour que le formulaire puisse écrire dans votre feuille Google Sheets sans demander de mot de passe aux commerçants, nous utilisons un **Google Apps Script** rattaché directement à votre feuille.

### Étape 1 : Ouvrir Apps Script depuis votre feuille
1. Ouvrez votre feuille : [https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit](https://docs.google.com/spreadsheets/d/1wIJ0RLxRCmD1di1JUR0L7ne52BiFUsa69RzKPuKM7Y4/edit?usp=sharing)
2. Dans le menu en haut, cliquez sur **Extensions** > **Apps Script**.
3. Une nouvelle page s'ouvre avec un éditeur de code. Supprimez tout le texte qui s'y trouve (le `function myFunction() { ... }`).

### Étape 2 : Coller le code
1. Ouvrez le fichier **[`Code.gs`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/Code.gs)** situé dans ce projet.
2. Copiez l'intégralité du code et collez-le dans l'éditeur Apps Script.
3. Cliquez sur l'icône **Enregistrer** (la petite disquette en haut) ou faites `Ctrl + S`.

### Étape 3 : Déployer en tant qu'Application Web
1. En haut à droite de l'éditeur Apps Script, cliquez sur le bouton bleu **Déployer** (Deploy) > **Nouveau déploiement** (New deployment).
2. Cliquez sur l'icône roue dentée ⚙️ à gauche de "Sélectionner un type" et sélectionnez **Application Web**.
3. Remplissez exactement ces 3 champs :
   - **Description :** `Webhook Sondage Cameroun`
   - **Exécuter en tant que :** `Moi (<votre email>)`
   - **Qui a accès :** **`Tous les utilisateurs`** (ou *Anyone* en anglais) ⚠️ *Essentiel pour permettre la synchronisation libre depuis le web.*
4. Cliquez sur **Déployer**.
5. Google affiche une fenêtre demandant d'**Autoriser l'accès** :
   - Cliquez sur **Autoriser l'accès**.
   - Sélectionnez votre compte Google.
   - Si un avertissement apparaît (*"Google n'a pas vérifié cette application"*), cliquez sur le lien **Paramètres avancés** (en bas à gauche), puis sur **Accéder à Sans titre (non sécurisé)**.
   - Cliquez sur **Autoriser**.
6. Vous obtenez une **URL de l'application Web** se terminant par `/exec`.  
   Exemple : `https://script.google.com/macros/s/AKfycb.../exec`
7. **Copiez cette URL Web App et collez-la ici dans notre chat**, ou directement dans le formulaire !

---

## 2. Connecter l'URL au Formulaire

Vous avez deux façons simples d'activer la synchronisation :

### Méthode A : Depuis l'interface web (Sans modifier le code)
1. Ouvrez `index.html` dans votre navigateur.
2. En haut à droite, cliquez sur le bouton **⚙️ Configuration Sheets**.
3. Collez votre URL Web App dans le champ et cliquez sur **Enregistrer**.
4. L'URL est mémorisée localement dans le navigateur !

### Méthode B : En dur dans le code `index.html`
Ouvrez le fichier `index.html` et remplacez la constante `DEFAULT_SCRIPT_URL` à la ligne ~678 :
```javascript
const DEFAULT_SCRIPT_URL = "VOTRE_URL_GOOGLE_APPS_SCRIPT_ICI";
```

---

## 3. Schéma des 51 Colonnes (A à AY)

Le script génère et remplit automatiquement la première ligne avec les 51 colonnes suivantes :

| Colonne | En-tête | Description |
|---|---|---|
| **A** | `Timestamp` | Date et heure de soumission (ISO 8601) |
| **B** | `Nom` | Nom du commerçant / répondant |
| **C** | `Prénom` | Prénom du répondant |
| **D** | `Email` | Adresse email du répondant |
| **E** | `Ville` | Ville principale (Douala, Yaoundé, Bafoussam, etc.) |
| **F** | `Q1_Ville_Localite` | Q1 : Ville ou localité exacte |
| **G** | `Q2_Type_Commerce` | Q2 : Type d'activité commerciale |
| **H** | `Q3_Anciennete` | Q3 : Durée d'activité |
| **I** | `Q4_Effectif` | Q4 : Nombre de personnes travaillant |
| **J** | `Q5_Points_De_Vente` | Q5 : Nombre de boutiques/points de vente |
| **K** | `Q6_Role` | Q6 : Fonction du répondant |
| **L** | `Q7_Enregistrement_Ventes` | Q7 : Méthode d'enregistrement des ventes |
| **M** | `Q8_Suivi_Stocks` | Q8 : Suivi des stocks |
| **N** | `Q9_Frequence_Inventaire` | Q9 : Fréquence de l'inventaire physique |
| **O** | `Q10_Calcul_Benefices` | Q10 : Calcul des bénéfices |
| **P** | `Q11_Suivi_Credits` | Q11 : Gestion des crédits accordés |
| **Q** | `Q12_Moyens_Paiement` | Q12 : Moyens de paiement acceptés |
| **R** | `Q13_Principales_Difficultes` | Q13 : 3 principales difficultés (max 3) |
| **S** | `Q14_Erreurs_Stocks` | Q14 : Fréquence des écarts d'inventaire |
| **T** | `Q15_Ruptures_Stocks` | Q15 : Fréquence des ruptures de stock |
| **U** | `Q16_Difficulte_Benefice` | Q16 : Difficulté calcul bénéfice réel |
| **V** | `Q17_Ecart_Recettes_Caisse` | Q17 : Différences recettes attendues vs réelles |
| **W** | `Q18_Oubli_Dette_Client` | Q18 : Oublis de dettes clients |
| **X** | `Q19_Temps_Quotidien_Gestion`| Q19 : Temps passé chaque jour à la gestion |
| **Y** | `Q20_Difficulte_Impact_Max` | Q20 : Difficulté avec le plus d'impact + Pourquoi |
| **Z** | `Q21_Exemple_Recent_Perte` | Q21 : Exemple récent d'erreur ou perte |
| **AA** | `Q22_Perte_Argent_3Mois` | Q22 : Estimation des pertes financières |
| **AB** | `Q23_Fonctionnalites_Utiles` | Q23 : Fonctionnalités utiles (max 5) |
| **AC** | `Q24_Probleme_Prioritaire` | Q24 : Problème n°1 à résoudre |
| **AD** | `Q25_Infos_Smartphone` | Q25 : Indicateurs souhaités sur mobile |
| **AE** | `Q26_Appareil_Prefere` | Q26 : Terminal préféré (Android, PC, etc.) |
| **AF** | `Q27_Mode_Hors_Ligne_Requis`| Q27 : Besoin de vente hors-ligne sans Internet |
| **AG** | `Q28_Utilisateurs_Logiciel` | Q28 : Utilisateurs prévus |
| **AH** | `Q29_Logiciel_Actuel` | Q29 : Utilisation d'un logiciel actuel |
| **AI** | `Q30_Cout_Actuel` | Q30 : Coût mensuel actuel |
| **AJ** | `Q31_Points_Forts_Actuels` | Q31 : Ce qui plaît dans l'outil actuel |
| **AK** | `Q32_Points_Faibles_Actuels` | Q32 : Ce qui déplaît / manque |
| **AL** | `Q33_Raison_Non_Utilisation`| Q33 : Motif d'absence de logiciel |
| **AM** | `Q34_Utilite_Percue` | Q34 : Utilité perçue du concept |
| **AN** | `Q35_Intention_Utilisation` | Q35 : Intention d'utilisation |
| **AO** | `Q36_Mode_Paiement_Prefere` | Q36 : Préférence de facturation (Abonnement...) |
| **AP** | `Q37_Prix_Mensuel_Acceptable`| Q37 : Fourchette de prix acceptable |
| **AQ** | `Q38_Prix_Trop_Cher` | Q38 : Seuil psychologique prix trop cher |
| **AR** | `Q39_Prix_Trop_Bas_Douteux` | Q39 : Seuil psychologique prix suspect |
| **AS** | `Q40_Accord_Abonnement` | Q40 : Accord pour un abonnement si gain de temps |
| **AT** | `Q41_Pret_A_Tester_Version_Pilote` | Q41 : Volonté de tester le logiciel |
| **AU** | `Q42_Pret_A_Payer_Prochaines_Semaines` | Q42 : Prêt à payer à court terme |
| **AV** | `Q43_Decideur_Achat` | Q43 : Rôle du décideur d'achat |
| **AW** | `Q44_Accompagnement_Souhaite` | Q44 : Type d'accompagnement souhaité |
| **AX** | `Q45_Motif_Refus` | Q45 : Principal motif de refus |
| **AY** | `Q46_Accord_Recontact` | Q46 : Accord de recontact (+ Contact WhatsApp/Tél) |

---

## 4. Partager la Feuille en Lecture Seule

1. Dans votre feuille Google Sheets, cliquez sur le bouton vert **Partager** en haut à droite.
2. Dans la section *Accès général*, changez "Limité" par : **Tous les utilisateurs disposant du lien**.
3. Réglez le rôle sur **Lecteur**.
4. Cliquez sur **Copier le lien**. Vous pouvez désormais transmettre ce lien à votre équipe.

---

## 5. Déploiement Gratuit du Formulaire

### Option 1 : Déploiement en 1 clic sur Vercel
1. Rendez-vous sur [vercel.com](https://vercel.com) (connexion gratuite avec GitHub ou email).
2. Glissez-déposez simplement le dossier contenant `index.html`.
3. Votre site est instantanément en ligne avec une URL HTTPS sécurisée (ex: `https://etude-marche-cameroun.vercel.app`).

### Option 2 : Déploiement sur Netlify
1. Rendez-vous sur [app.netlify.com/drop](https://app.netlify.com/drop).
2. Glissez-déposez le dossier du projet dans la zone de dépôt.
3. Votre site est déployé en 10 secondes avec une adresse du type `https://xxxx.netlify.app`.

### Option 3 : GitHub Pages
1. Créez un dépôt GitHub et déposez `index.html`.
2. Allez dans **Settings** > **Pages** > Source : branche `main`.
3. Votre site sera disponible à l'adresse `https://<votre-compte>.github.io/<nom-du-repo>/`.

---

## 6. Checklist de Validation Manuelle (Avant Enquête Terrain)

- [ ] **Affichage mobile :** Ouvrir le formulaire sur smartphone (Android / iPhone). Vérifier que le texte ne déborde pas et que les boutons sont larges et faciles à toucher.
- [ ] **Validation Section A :** Laisser les champs obligatoires vides (Nom, Prénom, Email, Ville) et tenter de passer à la section suivante ou de soumettre. Un message rouge doit s'afficher et la section doit rester bloquée.
- [ ] **Validation Email :** Saisir un email invalide (ex: `test@com`) et vérifier le blocage.
- [ ] **Contrainte Q13 :** Cocher 3 réponses. Vérifier que les autres choix sont grisés et que le compteur indique `3 / 3`. Tenter d'en cocher une 4ème pour confirmer le blocage.
- [ ] **Contrainte Q23 :** Cocher 5 réponses. Vérifier que les autres choix sont grisés et que le compteur indique `5 / 5`.
- [ ] **Navigation :** Naviguer entre les sections (Précédent / Suivant / Puces A-G). Vérifier que les choix déjà cochés sont conservés.
- [ ] **Soumission :** Remplir un test complet et cliquer sur "Envoyer le sondage". Vérifier que le bouton passe à "Envoi en cours..." sans freeze.
- [ ] **Vérification Sheets :** Ouvrir la feuille Google Sheets et constater l'apparition immédiate d'une nouvelle ligne avec le timestamp, l'identité et les 46 colonnes bien ordonnées de A à AY.
- [ ] **Fallback Hors-ligne :** En cas d'absence de réseau, vérifier que les réponses sont stockées dans le navigateur et téléchargeables en fichier CSV via le bouton **📥 Sauvegarde CSV**.

