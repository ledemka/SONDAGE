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
 * Utilitaire pour formater une réponse JSON
 */
function jsonResponse(payload, httpStatusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
