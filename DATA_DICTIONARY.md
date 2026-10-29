# DICTIONNAIRE DE DONNÉES ANALYTIQUE — SONDAGE MARCHÉ CAMEROUN
**Version :** 2.2  
**Date :** Octobre 2026  
**Cible de stockage :** Google Sheets — Onglet `Reponses_Sondage_v2` (53 colonnes)  
**Endpoint de collecte :** `/api/submit` (Vercel) -> `doPost` (Google Apps Script)  
**Endpoint analytique :** `/api/dashboard` (Vercel) <- `doGet` sécurisé (Google Apps Script)  

---

## 1. Vue d'ensemble du Schéma

Le schéma se compose de **53 colonnes** strictement ordonnées de la colonne `A` (1) à `BA` (53).  
Chaque ligne correspond à une soumission unique d'un commerçant répondant.

### Classification de confidentialité :
- **PII (Données Personnelles Identifiantes)** : Nom, Prénom, Email.  
  *Règle stricte :* **JAMAIS** renvoyées au Dashboard ou au navigateur web. Conservées uniquement dans le classeur Google Sheets privé du porteur de projet.
- **Profil & Segmentation** : Ville, Secteur, Ancienneté, Effectif, Points de vente, Rôle.
- **Variables Métier (Q7 à Q22)** : Pratiques actuelles de gestion, difficultés et gravité.
- **Variables Produit (Q23 à Q33)** : Besoins fonctionnels, consultation mobile, freins à l'adoption.
- **Variables Économiques & Commerciales (Q34 à Q46)** : Prix psychologique, disposition à payer, test pilote, recontact.

---

## 2. Table Détaillée des 53 Colonnes

| # | Nom Colonne Google Sheets | Champ Formulaire | Type Donnée | Modalités / Valeurs autorisées | Règle Analytique & Usage KPI | Niveau Confidentialité |
|---|---|---|---|---|---|---|
| **1** | `Submission_ID` | `submission_id` | UUID / String | Chaine 8 à 120 caractères (ex: `sub_...`) | Clé primaire d'idempotence et de déduplication. Dénominateur de base. | Technique |
| **2** | `Timestamp_Serveur` | Auto (GAS) | ISO 8601 | Ex: `2026-10-29T18:42:00.000Z` | Série temporelle, calcul du volume par jour/semaine, date dernière réponse. | Technique |
| **3** | `Nom` | `nom` | String | Texte libre (max 100 car.) | Exclu des flux analytiques. | **PII (Exclu)** |
| **4** | `Prénom` | `prenom` | String | Texte libre (max 100 car.) | Exclu des flux analytiques. | **PII (Exclu)** |
| **5** | `Email` | `email` | String | Adresse email valide | Exclu des flux analytiques. | **PII (Exclu)** |
| **6** | `Ville` | `ville` | String | Douala, Yaoundé, Bafoussam, Garoua, Bamenda, Autre | Filtre géographique primaire. | Profil |
| **7** | `Consentement_Marketing` | `consent_marketing`| Boolean | `Oui` / `Non` | Taux d'opt-in pour actualités futures. | Marketing |
| **8** | `Q1_Ville_Localite` | `q1` | String | Douala, Yaoundé, Bafoussam, Garoua, Bamenda, Autre (+ précision si Autre) | Répartition géographique détaillée du commerce. | Profil |
| **9** | `Q2_Type_Commerce` | `q2` | String | 10 catégories (Boutique de quartier, Quincaillerie, Prêt-à-porter, etc.) | Segmentation sectorielle principale. | Profil |
| **10** | `Q3_Anciennete` | `q3` | Ordinal | Moins d'un an, 1 à 3 ans, 4 à 7 ans, Plus de 7 ans | Maturité de l'entreprise. | Profil |
| **11** | `Q4_Effectif` | `q4` | Ordinal | 1 personne, 2 à 3, 4 à 6, 7 à 10, Plus de 10 | Taille humaine et potentiel d'utilisateurs multiples. | Profil |
| **12** | `Q5_Points_De_Vente` | `q5` | Ordinal | Un seul, Deux, Trois à cinq, Plus de cinq | Mono-boutique vs Multi-boutiques. | Profil |
| **13** | `Q6_Role` | `q6` | String | Propriétaire, Gérant, Employé / Vendeur, Autre | Profil de l'interlocuteur (décideur direct ou prescripteur). | Profil |
| **14** | `Q7_Enregistrement_Ventes` | `q7` | String | Cahier, Mémoire, Calculatrice, Tableur, Application, Autre | Niveau de digitalisation des ventes actuelles. | Métier |
| **15** | `Q8_Suivi_Stocks` | `q8` | String | Vérification physique, Cahier, Excel, Application, Aucun | Niveau de maturité dans la gestion d'inventaire. | Métier |
| **16** | `Q9_Frequence_Inventaire` | `q9` | Ordinal | Tous les jours, Chaque semaine, Chaque mois, Quelques fois/an, Lors de problème, Jamais | Discipline de gestion de stock. | Métier |
| **17** | `Q10_Calcul_Benefices` | `q10` | String | Approximation, Marge par produit, Tableur/App, Cahier, Jamais | Rigueur financière et calcul de rentabilité. | Métier |
| **18** | `Q11_Suivi_Credits` | `q11` | String | Cahier, Reçus/Fiches, Mémoire, Application, N'accorde pas de crédit | Pratique du crédit client ("carnet de crédit"). | Métier |
| **19** | `Q12_Moyens_Paiement` | `q12` | Multi (`;`) | Espèces, MTN Mobile Money, Orange Money, Virement, Carte bancaire | Pénétration du Mobile Money vs Espèces. | Métier |
| **20** | `Q13_Principales_Difficultes` | `q13` | Multi (`;`) | Max 3 choix parmi 8 items (Ruptures, Pertes/Vol, Calcul marge, Erreurs caisse, Dettes, Perte temps, etc.) | **KPI Majeur : Fréquence des problèmes.** Comptage unitaire par répondant. | Problématique |
| **21** | `Q14_Erreurs_Stocks` | `q14` | Échelle | Oui fréquemment, Oui occasionnellement, Rarement, Jamais, Ne sait pas | Fréquence des écarts d'inventaire. | Gravité |
| **22** | `Q15_Ruptures_Stocks` | `q15` | Échelle | Plusieurs fois/semaine, Plusieurs fois/mois, 1-2 fois, Jamais, Ne sait pas | Fréquence des ruptures de stock. | Gravité |
| **23** | `Q16_Difficulte_Benefice` | `q16` | Échelle | Très souvent, Souvent, Parfois, Rarement, Jamais | Fréquence du flou sur le bénéfice réel. | Gravité |
| **24** | `Q17_Ecart_Recettes_Caisse` | `q17` | Échelle | Très souvent, Parfois, Rarement, Jamais, Préfère ne pas répondre | Écarts inexpliqués en caisse (pertes financières directes). | Gravité |
| **25** | `Q18_Oubli_Dette_Client` | `q18` | Échelle | Souvent, Parfois, Rarement, Jamais, N'accorde pas de crédit | Taux d'oubli de créances clients. | Gravité |
| **26** | `Q19_Temps_Quotidien_Gestion`| `q19` | Ordinal | <15 min, 15-30 min, 31-60 min, 1-2 h, >2 h | Coût en temps de la gestion administrative. | Impact |
| **27** | `Q20_Difficulte_Impact_Max` | `q20` | Texte libre | Texte explicatif | Analyse qualitative de l'impact critique. | Qualitatif |
| **28** | `Q21_Exemple_Recent_Perte` | `q21` | Texte libre | Texte explicatif | Cas d'usage réels et anecdotes de pertes. | Qualitatif |
| **29** | `Q22_Perte_Argent_3Mois` | `q22` | Catégoriel + Nombre | `Oui (Montant: X FCFA)` ou `Non` ou `Je ne sais pas` | Taux de commerçants ayant perdu de l'argent et montant moyen si renseigné. | Impact Éco |
| **30** | `Q23_Fonctionnalites_Utiles` | `q23` | Multi (`;`) | Max 5 choix parmi 9 items (Ventes rapides, Stock auto, Alertes stock, Calcul marges, Crédit client, Rapports, Multi-utilisateurs, Reçus WhatsApp, Mode hors-ligne) | **KPI Majeur : Demande fonctionnelle produit.** | Besoins |
| **31** | `Q24_Probleme_Prioritaire` | `q24` | Texte libre | Texte explicatif | Le problème n°1 à résoudre impérativement. | Qualitatif |
| **32** | `Q25_Infos_Smartphone` | `q25` | Multi (`;`) | CA du jour, Bénéfice estimé, Top ventes, Alertes épuisement, Total créances, Recettes par mode de paiement | Priorité des widgets sur l'écran d'accueil mobile. | UX / Mobile |
| **33** | `Q26_Appareil_Prefere` | `q26` | String | Smartphone Android, Ordinateur, Tablette, Terminal dédié, Peu importe | Orientation technique de la plateforme (Mobile First vs PC). | Technique |
| **34** | `Q27_Mode_Hors_Ligne_Requis`| `q27` | Ordinal | Oui absolument, Oui si possible, Non, Ne sait pas | Exigence d'architecture locale (Offline-First / Sync). | Technique |
| **35** | `Q28_Utilisateurs_Logiciel` | `q28` | String | Moi uniquement, Moi et employés, Employés uniquement, Autre | Besoin de gestion de profils et permissions (RBAC). | Produit |
| **36** | `Q29_Logiciel_Actuel` | `q29` | Binaire | Oui, Non | Taux de numérisation logicielle actuel. | Marché |
| **37** | `Q30_Cout_Actuel` | `q30` | Ordinal | Gratuit, <5000, 5000-15000, 15000-30000, >30000 FCFA/mois, Non applicable | Dépense actuelle pour logiciels concurrents. | Économique |
| **38** | `Q31_Points_Forts_Actuels` | `q31` | Texte libre | Texte explicatif | Forces de la concurrence. | Concurrence |
| **39** | `Q32_Points_Faibles_Actuels`| `q32` | Texte libre | Texte explicatif | Faiblesses et opportunités de différenciation. | Concurrence |
| **40** | `Q33_Raison_Non_Utilisation`| `q33` | String | Prix trop élevé, Pas le besoin, Système convient, Ne sait pas quoi choisir, Trop compliqué, Problèmes électricité/net | Principaux freins à l'adoption. | Barrières |
| **41** | `Q34_Utilite_Percue` | `q34` | Échelle 1-5 | Pas du tout utile, Peu utile, Moyennement utile, Très utile, Indispensable | Valeur perçue du produit (Product-Market Fit score). | Commercial |
| **42** | `Q35_Intention_Utilisation` | `q35` | Échelle 1-5 | Certainement pas, Probablement pas, Peut-être, Probablement, Oui certainement | Intention déclarée d'adoption. | Commercial |
| **43** | `Q36_Mode_Paiement_Prefere` | `q36` | String | Abonnement mensuel, Abonnement annuel, Achat unique de licence, Paiement à l'usage | Modèle économique plébiscité. | Pricing |
| **44** | `Q37_Prix_Mensuel_Acceptable`| `q37`| Ordinal | Gratuit uniquement, 1 000-4 999, 5 000-9 999, 10 000-14 999, 15 000-25 000, >25 000 FCFA | Fourchette de prix mensuel cible. | Pricing |
| **45** | `Q38_Prix_Trop_Cher` | `q38` | Chiffré / String | Montant en FCFA | Prix plafond (Van Westendorp). | Pricing |
| **46** | `Q39_Prix_Trop_Bas_Douteux` | `q39` | Chiffré / String | Montant en FCFA | Prix plancher / seuil de qualité perçue. | Pricing |
| **47** | `Q40_Accord_Abonnement` | `q40` | String | Oui, Non, Cela dépend du prix et des fonctionnalités | Acceptation du modèle SaaS. | Commercial |
| **48** | `Q41_Pret_A_Tester_Version_Pilote` | `q41` | String | Oui gratuitement, Oui abonnement réduit, Oui si démo concluante, Non | Potentiel de recrutement d'utilisateurs bêta. | Commercial |
| **49** | `Q42_Pret_A_Payer_Prochaines_Semaines` | `q42` | String | Oui, Peut-être après démo, Peut-être après essai, Non | Chaleur du prospect et propension à payer immédiate. | Commercial |
| **50** | `Q43_Decideur_Achat` | `q43` | String | Moi-même, Propriétaire, Gérant, Décision collective | Circuit de décision d'achat. | Commercial |
| **51** | `Q44_Accompagnement_Souhaite`| `q44`| String | WhatsApp/Tél, Formation présentielle, Vidéo, Installation, Documentation, Aucun | Besoins de Customer Success et onboarding. | Support |
| **52** | `Q45_Motif_Refus` | `q45` | Texte libre | Texte explicatif | Objections de vente majeures. | Objections |
| **53** | `Q46_Accord_Recontact` | `q46` | Binaire | Oui, Non | **Opt-in commercial explicite pour démo/bêta.** | Commercial |
