/**
 * ============================================================================
 * ÉTUDE DE MARCHÉ — COMMERCES AU CAMEROUN
 * Script de réception des réponses et synchronisation automatique Google Sheets
 * ============================================================================
 * 
 * Ce script reçoit les réponses envoyées depuis le formulaire web (index.html)
 * et les ajoute automatiquement dans votre feuille Google Sheets.
 * 
 * Schéma des 51 colonnes (A à AY) :
 * A: Timestamp
 * B: Nom
 * C: Prénom
 * D: Email
 * E: Ville
 * F à AY : Questions Q1 à Q46
 */

// Nom de l'onglet où insérer les données
const SHEET_NAME = "Reponses_Sondage";

/**
 * En-têtes officiels des 51 colonnes (A à AY)
 */
const HEADERS = [
  "Timestamp",
  "Nom",
  "Prénom",
  "Email",
  "Ville",
  "Q1_Ville_Localite",
  "Q2_Type_Commerce",
  "Q3_Anciennete",
  "Q4_Effectif",
  "Q5_Points_De_Vente",
  "Q6_Role",
  "Q7_Enregistrement_Ventes",
  "Q8_Suivi_Stocks",
  "Q9_Frequence_Inventaire",
  "Q10_Calcul_Benefices",
  "Q11_Suivi_Credits",
  "Q12_Moyens_Paiement",
  "Q13_Principales_Difficultes",
  "Q14_Erreurs_Stocks",
  "Q15_Ruptures_Stocks",
  "Q16_Difficulte_Benefice",
  "Q17_Ecart_Recettes_Caisse",
  "Q18_Oubli_Dette_Client",
  "Q19_Temps_Quotidien_Gestion",
  "Q20_Difficulte_Impact_Max",
  "Q21_Exemple_Recent_Perte",
  "Q22_Perte_Argent_3Mois",
  "Q23_Fonctionnalites_Utiles",
  "Q24_Probleme_Prioritaire",
  "Q25_Infos_Smartphone",
  "Q26_Appareil_Prefere",
  "Q27_Mode_Hors_Ligne_Requis",
  "Q28_Utilisateurs_Logiciel",
  "Q29_Logiciel_Actuel",
  "Q30_Cout_Actuel",
  "Q31_Points_Forts_Actuels",
  "Q32_Points_Faibles_Actuels",
  "Q33_Raison_Non_Utilisation",
  "Q34_Utilite_Percue",
  "Q35_Intention_Utilisation",
  "Q36_Mode_Paiement_Prefere",
  "Q37_Prix_Mensuel_Acceptable",
  "Q38_Prix_Trop_Cher",
  "Q39_Prix_Trop_Bas_Douteux",
  "Q40_Accord_Abonnement",
  "Q41_Pret_A_Tester_Version_Pilote",
  "Q42_Pret_A_Payer_Prochaines_Semaines",
  "Q43_Decideur_Achat",
  "Q44_Accompagnement_Souhaite",
  "Q45_Motif_Refus",
  "Q46_Accord_Recontact"
];

/**
 * Traitement des requêtes POST envoyées par le formulaire
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Attendre jusqu'à 10 secondes pour éviter les conflits d'écriture simultanée
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // Si l'onglet n'existe pas, on le crée
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Si la première ligne est vide, on configure les en-têtes (Colonnes A à AY)
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setBackground("#0f766e");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    // Récupération des données JSON envoyées
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }

    // Construction de la ligne ordonnée selon les 51 colonnes A à AY
    const row = [
      data.timestamp || new Date().toISOString(),
      data.nom || "",
      data.prenom || "",
      data.email || "",
      data.ville || "",
      data.q1 || "",
      data.q2 || "",
      data.q3 || "",
      data.q4 || "",
      data.q5 || "",
      data.q6 || "",
      data.q7 || "",
      data.q8 || "",
      data.q9 || "",
      data.q10 || "",
      data.q11 || "",
      data.q12 || "",
      data.q13 || "",
      data.q14 || "",
      data.q15 || "",
      data.q16 || "",
      data.q17 || "",
      data.q18 || "",
      data.q19 || "",
      data.q20 || "",
      data.q21 || "",
      data.q22 || "",
      data.q23 || "",
      data.q24 || "",
      data.q25 || "",
      data.q26 || "",
      data.q27 || "",
      data.q28 || "",
      data.q29 || "",
      data.q30 || "",
      data.q31 || "",
      data.q32 || "",
      data.q33 || "",
      data.q34 || "",
      data.q35 || "",
      data.q36 || "",
      data.q37 || "",
      data.q38 || "",
      data.q39 || "",
      data.q40 || "",
      data.q41 || "",
      data.q42 || "",
      data.q43 || "",
      data.q44 || "",
      data.q45 || "",
      data.q46 || ""
    ];

    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Réponse enregistrée avec succès",
      row: sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Traitement des requêtes GET (pour tester l'URL dans un navigateur)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Le webhook de synchronisation Google Sheets pour l'étude de marché Cameroun est actif et prêt à recevoir des données POST."
  })).setMimeType(ContentService.MimeType.JSON);
}

