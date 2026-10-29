/**
 * ============================================================================
 * ÉTUDE DE MARCHÉ — COMMERCES AU CAMEROUN
 * Backend Google Apps Script (Version 2.1 — Production Sécurisée)
 * ============================================================================
 * 
 * NOUVEAUTÉS V2.1 :
 * 1. Protection des anciennes données : Les nouvelles réponses sont enregistrées
 *    dans l'onglet versionné 'Reponses_Sondage_v2'. L'ancien onglet 'Reponses_Sondage'
 *    est préservé sans altération des données historiques.
 * 2. Idempotence durable : Vérification permanente dans la colonne A (Submission_ID)
 *    avec verrouillage atomique LockService (aucun doublon même en concurrence).
 * 3. Validation stricte serveur : Rejet explicite des emails invalides,
 *    des champs manquants, du honeypot et des charges trop volumineuses.
 * 4. Fonction de migration sécurisée : migrateLegacyV1ToV2() disponible pour
 *    l'administrateur.
 */

const SHEET_NAME_V2 = "Reponses_Sondage_v2";
const SHEET_NAME_LEGACY = "Reponses_Sondage";
const SHEET_NAME_DASHBOARD = "Dashboard_KPI";
const MAX_PAYLOAD_BYTES = 65536; // 64 Ko max
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

/**
 * En-têtes officiels des 53 colonnes (A à BA)
 */
const HEADERS_V2 = [
  "Submission_ID",
  "Timestamp_Serveur",
  "Nom",
  "Prénom",
  "Email",
  "Ville",
  "Consentement_Marketing",
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
 * Traitement des requêtes POST (Enregistrement des soumissions)
 */
function doPost(e) {
  // 1. Contrôle préliminaire
  if (!e || (!e.postData && !e.parameter)) {
    return jsonResponse({
      status: "error",
      code: "EMPTY_REQUEST",
      message: "Requête vide ou mal formée."
    }, 400);
  }

  // 2. Contrôle de taille (Anti-DoS)
  const rawContent = e.postData ? e.postData.contents : "";
  if (rawContent && rawContent.length > MAX_PAYLOAD_BYTES) {
    return jsonResponse({
      status: "error",
      code: "PAYLOAD_TOO_LARGE",
      message: "La taille des données dépasse la limite autorisée."
    }, 413);
  }

  // 3. Décodage du payload JSON
  let data;
  try {
    data = rawContent ? JSON.parse(rawContent) : e.parameter;
  } catch (err) {
    return jsonResponse({
      status: "error",
      code: "INVALID_JSON",
      message: "Format JSON invalide : " + err.toString()
    }, 400);
  }

  // 4. Protection Anti-Robot : Honeypot
  if (data.website && String(data.website).trim() !== "") {
    // Rejet pour les robots
    return jsonResponse({
      status: "error",
      code: "SPAM_DETECTED",
      message: "Soumission rejetée par le filtre anti-robot."
    }, 403);
  }

  // 5. Validation stricte côté serveur
  const validationErrors = validateSubmissionData(data);
  if (validationErrors.length > 0) {
    return jsonResponse({
      status: "error",
      code: "VALIDATION_FAILED",
      message: "Données invalides : " + validationErrors.join(" ; "),
      errors: validationErrors
    }, 422);
  }

  // 6. Identifiant unique d'idempotence
  const submissionId = String(data.submission_id || "").trim() || Utilities.getUuid();

  // 7. Verrouillage atomique des écritures concurrentes
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(20000); // 20s
  if (!hasLock) {
    return jsonResponse({
      status: "error",
      code: "SERVER_BUSY",
      message: "Le serveur est temporairement saturé. Veuillez réessayer dans quelques instants."
    }, 503);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateV2Sheet(ss);

    // 8. Contrôle d'idempotence DURABLE dans la colonne A de la feuille
    const existing = findSubmissionInSheet(sheet, submissionId);
    if (existing) {
      return jsonResponse({
        status: "success",
        duplicate: true,
        submission_id: submissionId,
        row: existing.row,
        message: "Cette réponse a déjà été enregistrée sous cet identifiant (déduplication active)."
      });
    }

    // 9. Horodatage certifié serveur
    const serverTimestamp = new Date().toISOString();

    // 10. Assainissement anti-injection de formule (=, +, -, @)
    const sanitize = (val) => {
      if (val === null || val === undefined) return "";
      let s = String(val).trim();
      if (s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@")) {
        s = "'" + s;
      }
      return s;
    };

    const row = [
      sanitize(submissionId),
      sanitize(serverTimestamp),
      sanitize(data.nom),
      sanitize(data.prenom),
      sanitize(data.email),
      sanitize(data.ville),
      sanitize(data.consent_marketing ? "Oui" : "Non"),
      sanitize(data.q1),
      sanitize(data.q2),
      sanitize(data.q3),
      sanitize(data.q4),
      sanitize(data.q5),
      sanitize(data.q6),
      sanitize(data.q7),
      sanitize(data.q8),
      sanitize(data.q9),
      sanitize(data.q10),
      sanitize(data.q11),
      sanitize(data.q12),
      sanitize(data.q13),
      sanitize(data.q14),
      sanitize(data.q15),
      sanitize(data.q16),
      sanitize(data.q17),
      sanitize(data.q18),
      sanitize(data.q19),
      sanitize(data.q20),
      sanitize(data.q21),
      sanitize(data.q22),
      sanitize(data.q23),
      sanitize(data.q24),
      sanitize(data.q25),
      sanitize(data.q26),
      sanitize(data.q27),
      sanitize(data.q28),
      sanitize(data.q29),
      sanitize(data.q30),
      sanitize(data.q31),
      sanitize(data.q32),
      sanitize(data.q33),
      sanitize(data.q34),
      sanitize(data.q35),
      sanitize(data.q36),
      sanitize(data.q37),
      sanitize(data.q38),
      sanitize(data.q39),
      sanitize(data.q40),
      sanitize(data.q41),
      sanitize(data.q42),
      sanitize(data.q43),
      sanitize(data.q44),
      sanitize(data.q45),
      sanitize(data.q46)
    ];

    sheet.appendRow(row);

    // Initialisation automatique de l'onglet Dashboard_KPI s'il n'existe pas encore
    if (!ss.getSheetByName(SHEET_NAME_DASHBOARD)) {
      try {
        setupOrUpdateDashboardSheet();
      } catch (errDash) {
        Logger.log("Info création Dashboard_KPI : " + errDash.toString());
      }
    }

    return jsonResponse({
      status: "success",
      submission_id: submissionId,
      duplicate: false,
      timestamp: serverTimestamp,
      row: sheet.getLastRow(),
      message: "Réponse enregistrée avec succès dans Google Sheets."
    });

  } catch (error) {
    Logger.log("Erreur doPost : " + error.toString());
    return jsonResponse({
      status: "error",
      code: "STORAGE_ERROR",
      message: "Une erreur est survenue lors de l'enregistrement dans la feuille."
    }, 500);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Traitement des requêtes GET (Diagnostic technique, Health Check & Analytics sécurisé)
 * 
 * SÉCURITÉ & CONFIDENTIALITÉ :
 * 1. Health check public sans exposition de données.
 * 2. Endpoint analytique (?action=read_analytics) strictement protégé par une clé secrète
 *    (DASHBOARD_API_KEY).
 * 3. ANONYMISATION STRICTE À LA SOURCE : Les colonnes Nom, Prénom et Email sont
 *    systématiquement purgées et NE SORTENT JAMAIS de Google Sheets vers le Dashboard.
 */
const DEFAULT_ANALYTICS_SECRET = "cm_sondage_analytics_secret_2026";

function getAnalyticsSecret() {
  const prop = PropertiesService.getScriptProperties().getProperty("DASHBOARD_API_KEY");
  return prop ? prop.trim() : DEFAULT_ANALYTICS_SECRET;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : "";

  // 1. Endpoint Analytique Sécurisé pour le Dashboard
  if (action === "read_analytics") {
    const providedKey = (e.parameter && e.parameter.key) ? String(e.parameter.key).trim() : "";
    const expectedKey = getAnalyticsSecret();

    if (!providedKey || providedKey !== expectedKey) {
      return jsonResponse({
        status: "error",
        code: "UNAUTHORIZED",
        message: "Accès refusé. Clé d'API analytique invalide ou manquante."
      }, 401);
    }

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAME_V2);
      
      if (!sheet || sheet.getLastRow() <= 1) {
        return jsonResponse({
          status: "success",
          count: 0,
          timestamp: new Date().toISOString(),
          data: []
        });
      }

      const lastRow = sheet.getLastRow();
      const lastCol = Math.min(sheet.getLastColumn(), HEADERS_V2.length);
      const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      const sanitizedRows = [];
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const subId = String(row[0] || "").trim();
        if (!subId) continue; // Ignorer les lignes vides

        // Mapping sans PII : Colonnes 2 (Nom), 3 (Prénom) et 4 (Email) sont EXCLUES
        sanitizedRows.push({
          submission_id: subId,
          timestamp: row[1] ? new Date(row[1]).toISOString() : "",
          ville: String(row[5] || ""),
          consent_marketing: String(row[6] || ""),
          q1: String(row[7] || ""),
          q2: String(row[8] || ""),
          q3: String(row[9] || ""),
          q4: String(row[10] || ""),
          q5: String(row[11] || ""),
          q6: String(row[12] || ""),
          q7: String(row[13] || ""),
          q8: String(row[14] || ""),
          q9: String(row[15] || ""),
          q10: String(row[16] || ""),
          q11: String(row[17] || ""),
          q12: String(row[18] || ""),
          q13: String(row[19] || ""),
          q14: String(row[20] || ""),
          q15: String(row[21] || ""),
          q16: String(row[22] || ""),
          q17: String(row[23] || ""),
          q18: String(row[24] || ""),
          q19: String(row[25] || ""),
          q20: String(row[26] || ""),
          q21: String(row[27] || ""),
          q22: String(row[28] || ""),
          q23: String(row[29] || ""),
          q24: String(row[30] || ""),
          q25: String(row[31] || ""),
          q26: String(row[32] || ""),
          q27: String(row[33] || ""),
          q28: String(row[34] || ""),
          q29: String(row[35] || ""),
          q30: String(row[36] || ""),
          q31: String(row[37] || ""),
          q32: String(row[38] || ""),
          q33: String(row[39] || ""),
          q34: String(row[40] || ""),
          q35: String(row[41] || ""),
          q36: String(row[42] || ""),
          q37: String(row[43] || ""),
          q38: String(row[44] || ""),
          q39: String(row[45] || ""),
          q40: String(row[46] || ""),
          q41: String(row[47] || ""),
          q42: String(row[48] || ""),
          q43: String(row[49] || ""),
          q44: String(row[50] || ""),
          q45: String(row[51] || ""),
          q46: String(row[52] || "")
        });
      }

      return jsonResponse({
        status: "success",
        count: sanitizedRows.length,
        timestamp: new Date().toISOString(),
        data: sanitizedRows
      });

    } catch (err) {
      Logger.log("Erreur lecture analytics : " + err.toString());
      return jsonResponse({
        status: "error",
        code: "ANALYTICS_READ_ERROR",
        message: "Impossible d'extraire les données analytiques de la feuille : " + err.toString()
      }, 500);
    }
  }

  // 2. Diagnostic standard (Health Check)
  return jsonResponse({
    status: "online",
    service: "Enquête Marché Cameroun — API de synchronisation",
    version: "2.2.0",
    schema_version: "v2",
    columns_count: HEADERS_V2.length,
    active_sheet: SHEET_NAME_V2,
    timestamp: new Date().toISOString()
  });
}

/**
 * Obtient ou initialise l'onglet v2 sans toucher à l'onglet historique
 */
function getOrCreateV2Sheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME_V2);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_V2);
    sheet.appendRow(HEADERS_V2);
    formatHeaderRow(sheet);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_V2);
    formatHeaderRow(sheet);
  }
  return sheet;
}

function formatHeaderRow(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_V2.length);
  headerRange.setBackground("#0f766e");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

/**
 * Recherche durable d'un identifiant dans la colonne A (Submission_ID)
 */
function findSubmissionInSheet(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  // Lecture de la colonne A
  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]).trim() === submissionId) {
      return { row: i + 2 };
    }
  }
  return null;
}

/**
 * Validation stricte des données côté serveur
 */
function validateSubmissionData(data) {
  const errors = [];

  // Nom obligatoire
  const nom = String(data.nom || "").trim();
  if (!nom) {
    errors.push("Le champ 'nom' est obligatoire");
  } else if (nom.length > 100) {
    errors.push("Le nom dépasse la limite de 100 caractères");
  }

  // Prénom obligatoire
  const prenom = String(data.prenom || "").trim();
  if (!prenom) {
    errors.push("Le champ 'prenom' est obligatoire");
  } else if (prenom.length > 100) {
    errors.push("Le prénom dépasse la limite de 100 caractères");
  }

  // Email obligatoire & format valide
  const email = String(data.email || "").trim();
  if (!email) {
    errors.push("Le champ 'email' est obligatoire");
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push("Le format de l'adresse email est invalide");
  } else if (email.length > 150) {
    errors.push("L'adresse email dépasse 150 caractères");
  }

  // Ville obligatoire
  const ville = String(data.ville || "").trim();
  if (!ville) {
    errors.push("Le champ 'ville' est obligatoire");
  } else if (ville.length > 100) {
    errors.push("Le nom de la ville est trop long");
  }

  // Consentement étude obligatoire
  if (data.consent_etude !== true && data.consent_etude !== "true") {
    errors.push("Le consentement à la participation à l'étude est obligatoire");
  }

  // Limite Q13 (Max 3 réponses)
  if (data.q13) {
    const q13Items = String(data.q13).split(";").map(s => s.trim()).filter(Boolean);
    if (q13Items.length > 3) {
      errors.push("La question 13 accepte au maximum 3 choix");
    }
  }

  // Limite Q23 (Max 5 réponses)
  if (data.q23) {
    const q23Items = String(data.q23).split(";").map(s => s.trim()).filter(Boolean);
    if (q23Items.length > 5) {
      errors.push("La question 23 accepte au maximum 5 choix");
    }
  }

  return errors;
}

/**
 * Procédure de migration administrateur sécurisée (v1 -> v2)
 * Peut être lancée manuellement depuis l'éditeur Apps Script sans risque
 */
function migrateLegacyV1ToV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const legacySheet = ss.getSheetByName(SHEET_NAME_LEGACY);
  if (!legacySheet) {
    Logger.log("Aucun onglet legacy trouvé (" + SHEET_NAME_LEGACY + ").");
    return "Aucun onglet legacy trouvé.";
  }

  const lastRow = legacySheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log("L'onglet legacy est vide.");
    return "Aucune donnée à migrer.";
  }

  const v2Sheet = getOrCreateV2Sheet(ss);
  const legacyData = legacySheet.getRange(2, 1, lastRow - 1, legacySheet.getLastColumn()).getValues();

  let migratedCount = 0;
  for (let i = 0; i < legacyData.length; i++) {
    const rowOld = legacyData[i];
    // Générer un ID de migration stable
    const legacySubId = "legacy_v1_row_" + (i + 2);

    // Vérifier si déjà migré
    if (findSubmissionInSheet(v2Sheet, legacySubId)) {
      continue;
    }

    // Mapping sécurisé des colonnes v1 vers v2 :
    // v1: A=Timestamp, B=Nom, C=Prenom, D=Email, E=Ville, F..AY=Q1..Q46
    // v2: A=Submission_ID, B=Timestamp_Serveur, C=Nom, D=Prenom, E=Email, F=Ville, G=Consentement_Marketing, H..BA=Q1..Q46
    const rowNew = [
      legacySubId,
      rowOld[0] || new Date().toISOString(), // Timestamp
      rowOld[1] || "", // Nom
      rowOld[2] || "", // Prenom
      rowOld[3] || "", // Email
      rowOld[4] || "", // Ville
      "Non spécifié (archive v1)" // Consentement Marketing
    ];

    // Ajouter les questions Q1 à Q46
    for (let c = 5; c < 51; c++) {
      rowNew.push(rowOld[c] !== undefined ? rowOld[c] : "");
    }

    v2Sheet.appendRow(rowNew);
    migratedCount++;
  }

  Logger.log("Migration terminée : " + migratedCount + " lignes migrées vers " + SHEET_NAME_V2);
  return "Migration terminée : " + migratedCount + " lignes migrées avec succès.";
}

/**
 * Menu personnalisé automatique dans Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu("📊 Enquête Marché")
      .addItem("📈 Créer / Mettre à jour l'onglet Dashboard KPI", "setupOrUpdateDashboardSheet")
      .addItem("🔄 Migrer les anciennes données v1 vers v2", "migrateLegacyV1ToV2")
      .addToUi();
  } catch (err) {
    Logger.log("onOpen non disponible dans ce contexte : " + err.toString());
  }
}

/**
 * Génère ou met à jour l'onglet 'Dashboard_KPI' directement dans Google Sheets
 * avec formules natives en temps réel, cartes KPI et tableaux croisés.
 */
function setupOrUpdateDashboardSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. S'assurer que l'onglet v2 existe
  const v2Sheet = getOrCreateV2Sheet(ss);

  // 2. Si l'onglet v2 est vide et que l'ancien onglet contient des données, migrer automatiquement
  const legacySheet = ss.getSheetByName(SHEET_NAME_LEGACY);
  if (v2Sheet.getLastRow() <= 1 && legacySheet && legacySheet.getLastRow() > 1) {
    try {
      migrateLegacyV1ToV2();
    } catch (eMig) {
      Logger.log("Info migration automatique : " + eMig.toString());
    }
  }

  let dash = ss.getSheetByName(SHEET_NAME_DASHBOARD);
  if (!dash) {
    dash = ss.insertSheet(SHEET_NAME_DASHBOARD, 0); // Positionner en premier onglet
  }

  dash.clear();
  dash.setGridlines(true);

  // Couleurs de la charte
  const tealDark = "#0f766e";
  const tealLight = "#ccfbf1";
  const slateHeader = "#334155";
  const grayLight = "#f8fafc";
  const white = "#ffffff";

  // Largeurs de colonnes
  dash.setColumnWidth(1, 30);  // A (marge)
  dash.setColumnWidth(2, 220); // B
  dash.setColumnWidth(3, 100); // C
  dash.setColumnWidth(4, 90);  // D
  dash.setColumnWidth(5, 30);  // E (séparateur)
  dash.setColumnWidth(6, 240); // F
  dash.setColumnWidth(7, 100); // G
  dash.setColumnWidth(8, 90);  // H
  dash.setColumnWidth(9, 30);  // I (séparateur)
  dash.setColumnWidth(10, 240); // J
  dash.setColumnWidth(11, 100); // K
  dash.setColumnWidth(12, 90);  // L

  // 1. BANNIÈRE TITRE (A1:L1)
  const titleRange = dash.getRange("A1:L1");
  titleRange.merge();
  titleRange.setValue("📊 TABLEAU DE BORD KPI — ÉTUDE DE MARCHÉ COMMERCES AU CAMEROUN 🇨🇲");
  titleRange.setBackground(tealDark);
  titleRange.setFontColor(white);
  titleRange.setFontSize(13);
  titleRange.setFontWeight("bold");
  titleRange.setHorizontalAlignment("center");
  titleRange.setVerticalAlignment("middle");
  dash.setRowHeight(1, 40);

  // Sous-titre et Horodatage (A2:L2)
  dash.getRange("B2:D2").merge().setValue("Source : " + SHEET_NAME_V2 + " (Calculs en temps réel)").setFontSize(9).setFontColor("#64748b");
  dash.getRange("J2").setValue("Dernière actualisation :").setFontSize(9).setFontColor("#64748b").setHorizontalAlignment("right");
  dash.getRange("K2:L2").merge().setFormula("=NOW()").setFontSize(9).setFontColor("#64748b").setNumberFormat("dd/mm/yyyy hh:mm:ss");

  // 2. CARTES D'INDICATEURS CLÉS (KPI SUMMARY)
  // Card 1 : Total Réponses (Cellule B5)
  dash.getRange("B4:C4").merge().setValue("TOTAL RÉPONSES VALIDES").setFontSize(8).setFontWeight("bold").setFontColor("#166534").setHorizontalAlignment("center");
  dash.getRange("B5:C5").merge().setFormula("=COUNTA(" + SHEET_NAME_V2 + "!A2:A)").setFontSize(18).setFontWeight("bold").setFontColor("#166534").setHorizontalAlignment("center").setVerticalAlignment("middle");
  dash.getRange("B4:C5").setBackground("#f0fdf4").setBorder(true, true, true, true, false, false, "#bbf7d0", SpreadsheetApp.BorderStyle.SOLID);

  // Card 2 : Candidats Pilote (Q41) - Réfère strictement à B5
  dash.getRange("E4:F4").merge().setValue("CANDIDATS PILOTE (Q41)").setFontSize(8).setFontWeight("bold").setFontColor("#854d0e").setHorizontalAlignment("center");
  dash.getRange("E5:F5").merge().setFormula("=IF($B$5=0, 0, COUNTIF(" + SHEET_NAME_V2 + "!AV2:AV, \"*Oui*\") / $B$5)").setFontSize(18).setFontWeight("bold").setFontColor("#854d0e").setHorizontalAlignment("center").setVerticalAlignment("middle").setNumberFormat("0.0%");
  dash.getRange("E4:F5").setBackground("#fefce8").setBorder(true, true, true, true, false, false, "#fef08a", SpreadsheetApp.BorderStyle.SOLID);

  // Card 3 : Prêts à Payer (Q42) - Réfère strictement à B5
  dash.getRange("H4:I4").merge().setValue("PRÊTS À PAYER (Q42)").setFontSize(8).setFontWeight("bold").setFontColor("#1e40af").setHorizontalAlignment("center");
  dash.getRange("H5:I5").merge().setFormula("=IF($B$5=0, 0, (COUNTIF(" + SHEET_NAME_V2 + "!AW2:AW, \"*Oui*\") + COUNTIF(" + SHEET_NAME_V2 + "!AW2:AW, \"*Peut-être*\")) / $B$5)").setFontSize(18).setFontWeight("bold").setFontColor("#1e40af").setHorizontalAlignment("center").setVerticalAlignment("middle").setNumberFormat("0.0%");
  dash.getRange("H4:I5").setBackground("#eff6ff").setBorder(true, true, true, true, false, false, "#bfdbfe", SpreadsheetApp.BorderStyle.SOLID);

  // Card 4 : Accord Recontact (Q46) - Réfère strictement à B5
  dash.getRange("K4:L4").merge().setValue("ACCORD RECONTACT (Q46)").setFontSize(8).setFontWeight("bold").setFontColor("#9d174d").setHorizontalAlignment("center");
  dash.getRange("K5:L5").merge().setFormula("=IF($B$5=0, 0, COUNTIF(" + SHEET_NAME_V2 + "!BA2:BA, \"Oui\") / $B$5)").setFontSize(18).setFontWeight("bold").setFontColor("#9d174d").setHorizontalAlignment("center").setVerticalAlignment("middle").setNumberFormat("0.0%");
  dash.getRange("K4:L5").setBackground("#fdf2f8").setBorder(true, true, true, true, false, false, "#fbcfe8", SpreadsheetApp.BorderStyle.SOLID);

  dash.setRowHeight(4, 20);
  dash.setRowHeight(5, 34);

  // Helper pour formater une table
  function formatTable(startRow, startCol, headerTitle, headers, rowsData) {
    // Titre de bloc
    const titleCell = dash.getRange(startRow, startCol, 1, 3);
    titleCell.merge().setValue(headerTitle).setBackground(tealDark).setFontColor(white).setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
    
    // En-têtes de colonnes
    const hRange = dash.getRange(startRow + 1, startCol, 1, 3);
    hRange.setValues([headers]).setBackground(slateHeader).setFontColor(white).setFontWeight("bold").setFontSize(9);
    
    // Données & Formules
    for (let r = 0; r < rowsData.length; r++) {
      const curRow = startRow + 2 + r;
      dash.getRange(curRow, startCol).setValue(rowsData[r].label).setFontSize(9);
      dash.getRange(curRow, startCol + 1).setFormula(rowsData[r].formulaCount).setFontSize(9).setHorizontalAlignment("right");
      dash.getRange(curRow, startCol + 2).setFormula(rowsData[r].formulaPct).setFontSize(9).setHorizontalAlignment("right").setNumberFormat("0.0%");
      if (r % 2 === 1) {
        dash.getRange(curRow, startCol, 1, 3).setBackground("#f8fafc");
      }
    }

    // Bordures
    dash.getRange(startRow, startCol, rowsData.length + 2, 3).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  }

  // 3. BLOCS LIGNE 8 : Villes, Secteurs, Difficultés
  // Table Villes (Cols B-D, Row 8)
  const villes = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Bamenda", "Autre"];
  const villesRows = villes.map((v, i) => ({
    label: v,
    formulaCount: '=COUNTIF(' + SHEET_NAME_V2 + '!H2:H, "*' + (v === "Autre" ? "Autre" : v) + '*")',
    formulaPct: '=IF($B$5=0, 0, C' + (10 + i) + '/$B$5)'
  }));
  formatTable(8, 2, "1. RÉPARTITION PAR VILLE (Q1)", ["Ville", "Répondants", "% Total"], villesRows);

  // Table Secteurs (Cols F-H, Row 8)
  const secteurs = [
    { label: "Boutique / Alimentation", key: "*Boutique*" },
    { label: "Quincaillerie / Matériaux", key: "*Quincaillerie*" },
    { label: "Prêt-à-porter / Chaussures", key: "*Prêt-à-porter*" },
    { label: "Cosmétiques / Beauté", key: "*Cosmétiques*" },
    { label: "Électronique / Téléphonie", key: "*Électronique*" },
    { label: "Pharmacie / Parapharmacie", key: "*Pharmacie*" },
    { label: "Dépôt de boissons / Bar", key: "*boissons*" },
    { label: "Restaurant / Snack", key: "*Restaurant*" },
    { label: "Pièces détachées auto/moto", key: "*Pièces*" },
    { label: "Autre commerce", key: "*Autre*" }
  ];
  const secteursRows = secteurs.map((s, i) => ({
    label: s.label,
    formulaCount: '=COUNTIF(' + SHEET_NAME_V2 + '!I2:I, "' + s.key + '")',
    formulaPct: '=IF($B$5=0, 0, G' + (10 + i) + '/$B$5)'
  }));
  formatTable(8, 6, "2. SECTEURS D'ACTIVITÉ (Q2)", ["Secteur d'Activité", "Commerces", "% Total"], secteursRows);

  // Table Top Difficultés Q13 (Cols J-L, Row 8)
  const diffs = [
    { label: "Ruptures de stock", key: "*Ruptures*" },
    { label: "Produits perdus, volés, détériorés", key: "*perdus*" },
    { label: "Difficultés calcul des bénéfices", key: "*bénéfices*" },
    { label: "Erreurs de caisse / manquants", key: "*caisse*" },
    { label: "Suivi des dettes et impayés clients", key: "*dettes*" },
    { label: "Perte de temps administratif", key: "*temps*" },
    { label: "Manque visibilité rentabilité", key: "*visibilité*" }
  ];
  const diffsRows = diffs.map((d, i) => ({
    label: d.label,
    formulaCount: '=COUNTIF(' + SHEET_NAME_V2 + '!T2:T, "' + d.key + '")',
    formulaPct: '=IF($B$5=0, 0, K' + (10 + i) + '/$B$5)'
  }));
  formatTable(8, 10, "3. TOP DIFFICULTÉS RENCONTRÉES (Q13)", ["Difficulté", "Citations", "% Répondants"], diffsRows);

  // 4. BLOCS LIGNE 22 : Incidents critiques, Fonctionnalités attendues, Prix acceptable
  const incidents = [
    { label: "Ruptures de stock fréquentes (Q15)", formula: '=COUNTIF(' + SHEET_NAME_V2 + '!V2:V, "*semaine*") + COUNTIF(' + SHEET_NAME_V2 + '!V2:V, "*mois*")' },
    { label: "Flou récurrent sur bénéfices (Q16)", formula: '=COUNTIF(' + SHEET_NAME_V2 + '!W2:W, "*Très souvent*") + COUNTIF(' + SHEET_NAME_V2 + '!W2:W, "*Souvent*")' },
    { label: "Écarts de caisse inexpliqués (Q17)", formula: '=COUNTIF(' + SHEET_NAME_V2 + '!X2:X, "*Très souvent*") + COUNTIF(' + SHEET_NAME_V2 + '!X2:X, "*Parfois*")' },
    { label: "Oublis fréquents de dettes (Q18)", formula: '=COUNTIF(' + SHEET_NAME_V2 + '!Y2:Y, "*Souvent*") + COUNTIF(' + SHEET_NAME_V2 + '!Y2:Y, "*Parfois*")' },
    { label: "Pertes d'argent confirmées (Q22)", formula: '=COUNTIF(' + SHEET_NAME_V2 + '!AC2:AC, "Oui*")' }
  ];
  const incidentsRows = incidents.map((inc, i) => ({
    label: inc.label,
    formulaCount: inc.formula,
    formulaPct: '=IF($B$5=0, 0, C' + (24 + i) + '/$B$5)'
  }));
  formatTable(22, 2, "4. INCIDENTS CRITIQUES & PERTES", ["Incident Évalué", "Commerces", "% Total"], incidentsRows);

  const features = [
    { label: "Enregistrement rapide des ventes", key: "*rapide*" },
    { label: "Gestion automatique des stocks", key: "*stocks*" },
    { label: "Alertes de stock faible", key: "*Alertes*" },
    { label: "Calcul marges et bénéfices", key: "*marges*" },
    { label: "Suivi des crédits et dettes clients", key: "*crédits*" },
    { label: "Rapports de ventes quotidiens", key: "*Rapports*" },
    { label: "Mode hors-ligne indispensable", key: "*hors-ligne*" }
  ];
  const featuresRows = features.map((f, i) => ({
    label: f.label,
    formulaCount: '=COUNTIF(' + SHEET_NAME_V2 + '!AD2:AD, "' + f.key + '")',
    formulaPct: '=IF($B$5=0, 0, G' + (24 + i) + '/$B$5)'
  }));
  formatTable(22, 6, "5. BESOINS FONCTIONNELS (Q23)", ["Fonctionnalité Demandée", "Demandes", "% Répondants"], featuresRows);

  const budgets = [
    { label: "Gratuit uniquement", key: "*Gratuit*" },
    { label: "1 000 à 4 999 FCFA / mois", key: "*1 000*" },
    { label: "5 000 à 9 999 FCFA / mois", key: "*5 000*" },
    { label: "10 000 à 14 999 FCFA / mois", key: "*10 000*" },
    { label: "15 000 à 25 000 FCFA / mois", key: "*15 000*" },
    { label: "Plus de 25 000 FCFA / mois", key: "*Plus de*" }
  ];
  const budgetsRows = budgets.map((b, i) => ({
    label: b.label,
    formulaCount: '=COUNTIF(' + SHEET_NAME_V2 + '!AR2:AR, "' + b.key + '")',
    formulaPct: '=IF($B$5=0, 0, K' + (24 + i) + '/$B$5)'
  }));
  formatTable(22, 10, "6. BUDGET MENSUEL ACCEPTABLE (Q37)", ["Tranche de Prix (FCFA)", "Répondants", "% Total"], budgetsRows);

  Logger.log("Onglet '" + SHEET_NAME_DASHBOARD + "' configuré avec succès.");
  return "Onglet Dashboard KPI généré avec succès dans Google Sheets.";
}

/**
 * Utilitaire pour formater une réponse JSON
 */
function jsonResponse(payload, httpStatusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
