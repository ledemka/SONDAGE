/**
 * ============================================================================
 * ENDPOINT SERVEUR VERCEL (/api/submit)
 * Relais sécurisé et validateur côté serveur pour Google Apps Script
 * ============================================================================
 * 
 * Cet endpoint s'exécute côté serveur sur Vercel (Node.js Serverless Function).
 * Il assure :
 * 1. La vérification stricte de la méthode (POST uniquement).
 * 2. La validation de la présence de la variable d'environnement GOOGLE_APPS_SCRIPT_URL.
 * 3. La validation de structure, de taille (< 64 Ko) et des champs obligatoires.
 * 4. La détection immédiate du robot spammeur (Honeypot 'website').
 * 5. La transmission sécurisée à Google Apps Script avec gestion de timeout (20s).
 * 6. Le traitement des erreurs HTTP, non-JSON ou pannes de Google Sheets.
 * 7. L'absence de faux succès : le statut 'success' n'est renvoyé que si
 *    Google Apps Script a certifié l'enregistrement avec succès.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const MAX_PAYLOAD_BYTES = 65536; // 64 Ko
const REQUEST_TIMEOUT_MS = 20000; // 20s

export default async function handler(req, res) {
  // 1. Restriction stricte de la méthode
  if (req.method !== "POST") {
    return res.status(405).json({
      status: "error",
      code: "METHOD_NOT_ALLOWED",
      message: "Méthode non autorisée. Seules les requêtes POST sont acceptées."
    });
  }

  // 2. Vérification de la variable d'environnement serveur
  const gasUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!gasUrl || gasUrl.trim() === "" || gasUrl.includes("VOTRE_DEPLOYMENT_ID")) {
    return res.status(500).json({
      status: "error",
      code: "MISSING_ENV_VAR",
      message: "Configuration serveur incomplète : la variable d'environnement GOOGLE_APPS_SCRIPT_URL est absente ou non configurée sur Vercel."
    });
  }

  // 3. Vérification de la taille du payload
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({
      status: "error",
      code: "PAYLOAD_TOO_LARGE",
      message: "Le volume des données soumises dépasse la taille maximale autorisée (64 Ko)."
    });
  }

  // 4. Analyse et typage des données
  let data;
  try {
    data = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(rawBody);
  } catch (parseErr) {
    return res.status(400).json({
      status: "error",
      code: "INVALID_JSON",
      message: "Le format de la requête est un JSON invalide."
    });
  }

  // 5. Protection Anti-Robot : Honeypot (piège 'website')
  if (data.website && String(data.website).trim() !== "") {
    // Rejet immédiat sans solliciter Google Apps Script
    return res.status(403).json({
      status: "error",
      code: "SPAM_DETECTED",
      message: "Soumission rejetée par le filtre de sécurité."
    });
  }

  // 6. Validation métier préliminaire côté serveur Vercel
  const validationErrors = validatePayload(data);
  if (validationErrors.length > 0) {
    return res.status(422).json({
      status: "error",
      code: "VALIDATION_FAILED",
      message: "Erreur de validation : " + validationErrors.join(" ; "),
      errors: validationErrors
    });
  }

  // 7. Transmission à Google Apps Script avec timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Vérification du statut HTTP d'Apps Script
    if (!upstreamResponse.ok) {
      return res.status(502).json({
        status: "error",
        code: "UPSTREAM_HTTP_ERROR",
        message: `Le service d'enregistrement distant a retourné une erreur HTTP (${upstreamResponse.status}).`
      });
    }

    // Vérification que la réponse est bien du JSON (et non une page d'erreur HTML Google)
    const rawText = await upstreamResponse.text();
    let upstreamJson;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch (jsonErr) {
      return res.status(502).json({
        status: "error",
        code: "UPSTREAM_INVALID_JSON",
        message: "Le service d'enregistrement distant n'a pas retourné une confirmation JSON valide."
      });
    }

    // 8. Vérification stricte du statut métier et de l'intégrité de confirmation
    if (upstreamJson && upstreamJson.status === "success") {
      // 8a. Vérification de la concordance de l'identifiant de soumission
      const sentSubId = String(data.submission_id || "").trim();
      const returnedSubId = String(upstreamJson.submission_id || "").trim();
      if (sentSubId && returnedSubId && sentSubId !== returnedSubId) {
        return res.status(502).json({
          status: "error",
          code: "SUBMISSION_ID_MISMATCH",
          message: "Incohérence d'intégrité : l'identifiant confirmé par Google Apps Script ne correspond pas à la soumission envoyée."
        });
      }

      // 8b. Vérification qu'un enregistrement réel a eu lieu (row > 0) ou qu'un doublon avéré a été détecté
      const hasValidRow = typeof upstreamJson.row === "number" && upstreamJson.row > 0;
      const isDuplicate = upstreamJson.duplicate === true;

      if (!hasValidRow && !isDuplicate) {
        return res.status(502).json({
          status: "error",
          code: "UNCONFIRMED_RECORD",
          message: "L'enregistrement n'a pas pu être certifié de manière vérifiable par le service de stockage (aucun numéro de ligne ni déduplication confirmée)."
        });
      }

      return res.status(200).json({
        status: "success",
        submission_id: returnedSubId || sentSubId,
        duplicate: isDuplicate,
        row: hasValidRow ? upstreamJson.row : null,
        message: upstreamJson.message || "Réponse certifiée et enregistrée avec succès dans Google Sheets."
      });
    } else {
      // Rejet explicite par Google Apps Script (ex: validation serveur, verrou serveur)
      return res.status(422).json({
        status: "error",
        code: upstreamJson?.code || "UPSTREAM_REJECTED",
        message: upstreamJson?.message || "Le service Google Sheets n'a pas validé l'enregistrement."
      });
    }

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      return res.status(504).json({
        status: "error",
        code: "GATEWAY_TIMEOUT",
        message: "Délai d'attente dépassé lors de la communication avec Google Apps Script (20s)."
      });
    }

    return res.status(502).json({
      status: "error",
      code: "UPSTREAM_NETWORK_ERROR",
      message: "Impossible de joindre le service Google Apps Script."
    });
  }
}

/**
 * Validation des champs fondamentaux avant transmission
 */
function validatePayload(data) {
  const errors = [];

  const nom = String(data.nom || "").trim();
  if (!nom) errors.push("Le nom est obligatoire");
  else if (nom.length > 100) errors.push("Le nom dépasse 100 caractères");

  const prenom = String(data.prenom || "").trim();
  if (!prenom) errors.push("Le prénom est obligatoire");
  else if (prenom.length > 100) errors.push("Le prénom dépasse 100 caractères");

  const email = String(data.email || "").trim();
  if (!email) errors.push("L'adresse email est obligatoire");
  else if (!EMAIL_REGEX.test(email)) errors.push("Format d'email invalide");
  else if (email.length > 150) errors.push("Email trop long");

  const ville = String(data.ville || "").trim();
  if (!ville) errors.push("La ville principale est obligatoire");

  if (data.consent_etude !== true && data.consent_etude !== "true") {
    errors.push("Le consentement à l'étude est requis");
  }

  if (data.q13) {
    const q13Count = String(data.q13).split(";").map(s => s.trim()).filter(Boolean).length;
    if (q13Count > 3) errors.push("Q13 : maximum 3 choix");
  }

  if (data.q23) {
    const q23Count = String(data.q23).split(";").map(s => s.trim()).filter(Boolean).length;
    if (q23Count > 5) errors.push("Q23 : maximum 5 choix");
  }

  return errors;
}
