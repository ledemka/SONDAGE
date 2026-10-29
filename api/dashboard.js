/**
 * ============================================================================
 * ENDPOINT ANALYTIQUE SERVEUR : /api/dashboard
 * Plateforme : Vercel Serverless Function (Node.js)
 * ============================================================================
 * 
 * SÉCURITÉ & CONFIDENTIALITÉ :
 * 1. Authentification obligatoire : Vérifie le Bearer Token / Mot de passe
 *    défini dans DASHBOARD_PASSWORD.
 * 2. Communication sécurisée avec Google Sheets via Google Apps Script (action=read_analytics).
 * 3. ZÉRO PII (Données Personnelles) : Nom, Prénom, Email ne sont JAMAIS
 *    transmis au navigateur.
 * 4. Cache serveur in-memory (TTL 60s) avec option d'actualisation forcée (?refresh=true).
 * 5. Protection contre les dénis de service et gestion stricte des timeouts (15s).
 */

let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL_MS = 60 * 1000; // 60 secondes

export default async function handler(req, res) {
  // 1. Autoriser uniquement la méthode GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Seule la méthode GET est autorisée sur cet endpoint.'
    });
  }

  // 2. Contrôle d'authentification
  const configuredPassword = (process.env.DASHBOARD_PASSWORD || 'admin2026').trim();
  const authHeader = req.headers['authorization'] || '';
  const customHeader = req.headers['x-dashboard-key'] || '';
  const queryKey = req.query.key || '';

  let providedToken = '';
  if (authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (customHeader) {
    providedToken = String(customHeader).trim();
  } else if (queryKey) {
    providedToken = String(queryKey).trim();
  }

  if (!providedToken || providedToken !== configuredPassword) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Accès non autorisé. Veuillez fournir le mot de passe du dashboard.'
    });
  }

  // 3. Vérification de la configuration Google Apps Script
  const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!appsScriptUrl || !appsScriptUrl.trim()) {
    return res.status(500).json({
      status: 'error',
      code: 'CONFIG_ERROR',
      message: 'La variable GOOGLE_APPS_SCRIPT_URL est manquante dans les variables d\'environnement serveur.'
    });
  }

  const analyticsSecret = (process.env.DASHBOARD_API_KEY || 'cm_sondage_analytics_secret_2026').trim();
  const forceRefresh = req.query.refresh === 'true' || req.headers['cache-control'] === 'no-cache';
  const now = Date.now();

  // 4. Utilisation du cache si valide
  if (!forceRefresh && cache.data && (now - cache.timestamp < CACHE_TTL_MS)) {
    return res.status(200).json({
      status: 'success',
      cached: true,
      last_updated: new Date(cache.timestamp).toISOString(),
      ...cache.data
    });
  }

  // 5. Interrogation sécurisée de Google Apps Script
  try {
    const fetchUrl = `${appsScriptUrl.trim()}${appsScriptUrl.includes('?') ? '&' : '?'}action=read_analytics&key=${encodeURIComponent(analyticsSecret)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 secondes max

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        status: 'error',
        code: 'UPSTREAM_HTTP_ERROR',
        message: `Erreur HTTP ${response.status} reçue du service de données Google Sheets.`
      });
    }

    const json = await response.json();

    if (json.status !== 'success' || !Array.isArray(json.data)) {
      return res.status(502).json({
        status: 'error',
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: json.message || 'Réponse invalide du service Google Sheets.'
      });
    }

    // 6. Calcul des métriques & agrégations analytiques
    const rawRows = json.data;
    const computedMetrics = processSurveyData(rawRows);

    // Mettre à jour le cache
    cache = {
      data: computedMetrics,
      timestamp: now
    };

    return res.status(200).json({
      status: 'success',
      cached: false,
      last_updated: new Date(now).toISOString(),
      ...computedMetrics
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({
        status: 'error',
        code: 'UPSTREAM_TIMEOUT',
        message: 'Le délai d\'attente du service Google Sheets a été dépassé (15s).'
      });
    }

    return res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Erreur interne lors du traitement des données du dashboard.'
    });
  }
}

/**
 * Moteur de calcul des agrégations et indicateurs KPI
 */
function processSurveyData(rows) {
  // Filtrer les éventuelles lignes invalides
  const validRows = rows.filter(r => r && r.submission_id);
  const total = validRows.length;

  if (total === 0) {
    return {
      summary: {
        total_responses: 0,
        completed_responses: 0,
        completion_rate: 0,
        last_response_date: null,
        rate_pilote: 0,
        rate_payer: 0,
        rate_recontact: 0
      },
      demographics: { villes: [], secteurs: [], anciennete: [], effectif: [], points_vente: [], roles: [] },
      problemes_q13: [],
      gravite: {},
      fonctionnalites_q23: [],
      infos_smartphone_q25: [],
      pratiques: {},
      commercial: {},
      timeline: [],
      anonymized_records: []
    };
  }

  // 1. Synthèse globale
  let completedCount = 0;
  let lastDate = null;
  let piloteCount = 0;
  let payerCount = 0;
  let recontactCount = 0;

  validRows.forEach(r => {
    // Calcul de complétion : compter questions non vides
    let answered = 0;
    for (let i = 1; i <= 46; i++) {
      if (r[`q${i}`] && String(r[`q${i}`]).trim() !== '') answered++;
    }
    if (answered >= 35) completedCount++;

    // Date la plus récente
    if (r.timestamp) {
      const d = new Date(r.timestamp);
      if (!lastDate || d > lastDate) lastDate = d;
    }

    // Q41: Test pilote
    const q41 = String(r.q41 || '').toLowerCase();
    if (q41.includes('oui') || q41.includes('gratuit') || q41.includes('réduit') || q41.includes('concluant')) {
      piloteCount++;
    }

    // Q42: Prêt à payer prochaines semaines
    const q42 = String(r.q42 || '').toLowerCase();
    if (q42 === 'oui' || q42.includes('après une') || q42.includes('peut-être')) {
      payerCount++;
    }

    // Q46: Accord recontact
    const q46 = String(r.q46 || '').trim().toLowerCase();
    if (q46 === 'oui') {
      recontactCount++;
    }
  });

  const completionRate = Math.round((completedCount / total) * 100);
  const ratePilote = Math.round((piloteCount / total) * 100);
  const ratePayer = Math.round((payerCount / total) * 100);
  const rateRecontact = Math.round((recontactCount / total) * 100);

  // 2. Démographie
  const villes = countDistribution(validRows, r => r.ville || r.q1 || 'Non renseigné', total);
  const secteurs = countDistribution(validRows, r => r.q2 || 'Non renseigné', total);
  const anciennete = countDistribution(validRows, r => r.q3 || 'Non renseigné', total);
  const effectif = countDistribution(validRows, r => r.q4 || 'Non renseigné', total);
  const pointsVente = countDistribution(validRows, r => r.q5 || 'Non renseigné', total);
  const roles = countDistribution(validRows, r => r.q6 || 'Non renseigné', total);

  // 3. Q13: Principales difficultés (Choix multiple, max 3)
  const problemesQ13 = countMultiChoices(validRows, 'q13', total);

  // 4. Gravité & Fréquence des incidents
  const gravite = {
    q14_erreurs_stocks: countDistribution(validRows, r => r.q14 || 'Non renseigné', total),
    q15_ruptures_stocks: countDistribution(validRows, r => r.q15 || 'Non renseigné', total),
    q16_difficulte_benefice: countDistribution(validRows, r => r.q16 || 'Non renseigné', total),
    q17_ecart_caisse: countDistribution(validRows, r => r.q17 || 'Non renseigné', total),
    q18_oubli_dette: countDistribution(validRows, r => r.q18 || 'Non renseigné', total),
    q22_perte_argent: countDistribution(validRows, r => {
      const val = String(r.q22 || '').trim();
      if (val.startsWith('Oui')) return 'Oui (Pertes constatées)';
      if (val.startsWith('Non')) return 'Non';
      return val || 'Non renseigné';
    }, total)
  };

  // 5. Q23: Fonctionnalités utiles (Choix multiple, max 5)
  const fonctionnalitesQ23 = countMultiChoices(validRows, 'q23', total);

  // 6. Q25: Infos Smartphone (Choix multiple)
  const infosSmartphoneQ25 = countMultiChoices(validRows, 'q25', total);

  // 7. Pratiques actuelles de gestion
  const pratiques = {
    q7_ventes: countDistribution(validRows, r => r.q7 || 'Non renseigné', total),
    q8_stocks: countDistribution(validRows, r => r.q8 || 'Non renseigné', total),
    q9_inventaire: countDistribution(validRows, r => r.q9 || 'Non renseigné', total),
    q10_benefices: countDistribution(validRows, r => r.q10 || 'Non renseigné', total),
    q11_credits: countDistribution(validRows, r => r.q11 || 'Non renseigné', total),
    q12_paiements: countMultiChoices(validRows, 'q12', total)
  };

  // 8. Commercial & Pricing
  const commercial = {
    q34_utilite: countDistribution(validRows, r => r.q34 || 'Non renseigné', total),
    q35_intention: countDistribution(validRows, r => r.q35 || 'Non renseigné', total),
    q36_mode_paiement: countDistribution(validRows, r => r.q36 || 'Non renseigné', total),
    q37_prix_mensuel: countDistribution(validRows, r => r.q37 || 'Non renseigné', total),
    q40_accord_abonnement: countDistribution(validRows, r => r.q40 || 'Non renseigné', total),
    q41_pilote: countDistribution(validRows, r => r.q41 || 'Non renseigné', total),
    q42_payer: countDistribution(validRows, r => r.q42 || 'Non renseigné', total),
    q43_decideur: countDistribution(validRows, r => r.q43 || 'Non renseigné', total),
    q44_accompagnement: countDistribution(validRows, r => r.q44 || 'Non renseigné', total),
    q46_recontact: countDistribution(validRows, r => r.q46 || 'Non renseigné', total)
  };

  // 9. Série chronologique (Timeline quotidienne)
  const dailyCounts = {};
  validRows.forEach(r => {
    if (r.timestamp) {
      const day = r.timestamp.substring(0, 10); // YYYY-MM-DD
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
  });

  const timeline = Object.keys(dailyCounts).sort().map(day => ({
    date: day,
    count: dailyCounts[day]
  }));

  // 10. Enregistrements anonymisés pour le filtrage client interactif
  // STRICTEMENT SANS PII
  const anonymizedRecords = validRows.map(r => ({
    id: r.submission_id,
    date: r.timestamp ? r.timestamp.substring(0, 10) : '',
    ville: r.ville || r.q1 || '',
    secteur: r.q2 || '',
    anciennete: r.q3 || '',
    effectif: r.q4 || '',
    q13: r.q13 || '',
    q14: r.q14 || '',
    q15: r.q15 || '',
    q16: r.q16 || '',
    q17: r.q17 || '',
    q18: r.q18 || '',
    q22: r.q22 || '',
    q23: r.q23 || '',
    q25: r.q25 || '',
    q34: r.q34 || '',
    q35: r.q35 || '',
    q37: r.q37 || '',
    q41: r.q41 || '',
    q42: r.q42 || '',
    q46: r.q46 || ''
  }));

  return {
    summary: {
      total_responses: total,
      completed_responses: completedCount,
      completion_rate: completionRate,
      last_response_date: lastDate ? lastDate.toISOString() : null,
      rate_pilote: ratePilote,
      rate_payer: ratePayer,
      rate_recontact: rateRecontact
    },
    demographics: {
      villes,
      secteurs,
      anciennete,
      effectif,
      points_vente: pointsVente,
      roles
    },
    problemes_q13: problemesQ13,
    gravite,
    fonctionnalites_q23: fonctionnalitesQ23,
    infos_smartphone_q25: infosSmartphoneQ25,
    pratiques,
    commercial,
    timeline,
    anonymized_records: anonymizedRecords
  };
}

/**
 * Calcul de distribution pour une question à choix unique
 */
function countDistribution(rows, extractor, total) {
  const counts = {};
  rows.forEach(r => {
    const val = String(extractor(r) || '').trim() || 'Non renseigné';
    counts[val] = (counts[val] || 0) + 1;
  });

  return Object.keys(counts)
    .map(key => ({
      label: key,
      count: counts[key],
      pct: total > 0 ? Math.round((counts[key] / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calcul de distribution pour les questions à choix multiple délimitées par ';'
 * Règle stricte : Chaque répondant est compté au maximum 1 fois par option.
 */
function countMultiChoices(rows, fieldName, total) {
  const counts = {};
  rows.forEach(r => {
    const raw = String(r[fieldName] || '').trim();
    if (!raw) return;

    // Découper par point-virgule et dédupliquer au sein d'une même réponse
    const items = [...new Set(raw.split(';').map(s => s.trim()).filter(Boolean))];
    items.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
  });

  return Object.keys(counts)
    .map(key => ({
      label: key,
      count: counts[key],
      pct: total > 0 ? Math.round((counts[key] / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

