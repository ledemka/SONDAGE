/**
 * ============================================================================
 * SUITE DE TESTS UNITAIRES & ANALYTIQUES DU DASHBOARD KPI
 * ============================================================================
 */

import handler from './api/dashboard.js';

let passed = 0;
let failed = 0;

function assert(name, condition, expected, actual) {
  console.log(`\n----------------------------------------------------------`);
  console.log(`TEST: ${name}`);
  console.log(`Attendu : ${expected}`);
  console.log(`Obtenu  : ${actual}`);
  if (condition) {
    console.log(`RÉSULTAT: [PASS] Réussi`);
    passed++;
  } else {
    console.log(`RÉSULTAT: [FAIL] Échec`);
    failed++;
  }
}

// Mock Helper pour res
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log("==========================================================");
  console.log("DÉMARRAGE DE LA SUITE DE TESTS DU DASHBOARD KPI");
  console.log("==========================================================");

  // 1. TEST : Méthode non autorisée (POST sur /api/dashboard)
  {
    const req = { method: 'POST', headers: {}, query: {} };
    const res = createMockRes();
    await handler(req, res);
    assert(
      "1. Rejet des méthodes autres que GET",
      res.statusCode === 405 && res.body.code === 'METHOD_NOT_ALLOWED',
      "HTTP 405 METHOD_NOT_ALLOWED",
      `HTTP ${res.statusCode} (${res.body?.code})`
    );
  }

  // 2. TEST : Protection Authentification (Accès sans token)
  {
    const req = { method: 'GET', headers: {}, query: {} };
    const res = createMockRes();
    await handler(req, res);
    assert(
      "2. Protection Authentification : Rejet sans mot de passe",
      res.statusCode === 401 && res.body.code === 'UNAUTHORIZED',
      "HTTP 401 UNAUTHORIZED",
      `HTTP ${res.statusCode} (${res.body?.code})`
    );
  }

  // 3. TEST : Protection Authentification (Mauvais mot de passe)
  {
    const req = { method: 'GET', headers: { 'x-dashboard-key': 'mauvais_mdp' }, query: {} };
    const res = createMockRes();
    await handler(req, res);
    assert(
      "3. Protection Authentification : Rejet mauvais mot de passe",
      res.statusCode === 401 && res.body.code === 'UNAUTHORIZED',
      "HTTP 401 UNAUTHORIZED",
      `HTTP ${res.statusCode} (${res.body?.code})`
    );
  }

  // 4. TEST : Absence de la variable GOOGLE_APPS_SCRIPT_URL
  {
    const oldUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    delete process.env.GOOGLE_APPS_SCRIPT_URL;
    process.env.DASHBOARD_PASSWORD = 'test_password_123';

    const req = { method: 'GET', headers: { 'authorization': 'Bearer test_password_123' }, query: {} };
    const res = createMockRes();
    await handler(req, res);
    
    process.env.GOOGLE_APPS_SCRIPT_URL = oldUrl || 'https://script.google.com/macros/s/mock/exec';

    assert(
      "4. Gestion erreur : Variable GOOGLE_APPS_SCRIPT_URL absente",
      res.statusCode === 500 && res.body.code === 'CONFIG_ERROR',
      "HTTP 500 CONFIG_ERROR",
      `HTTP ${res.statusCode} (${res.body?.code})`
    );
  }

  // 5. TEST : Dataset vide (Gestion gracieuse de 0 réponse)
  {
    // Mock fetch pour simuler 0 réponse
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: "success",
        count: 0,
        data: []
      })
    });

    process.env.DASHBOARD_PASSWORD = 'test_password_123';
    process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/mock/exec';

    const req = { method: 'GET', headers: { 'x-dashboard-key': 'test_password_123' }, query: { refresh: 'true' } };
    const res = createMockRes();
    await handler(req, res);

    assert(
      "5. Dataset vide : Aucune erreur, total_responses = 0",
      res.statusCode === 200 && res.body.summary.total_responses === 0 && res.body.anonymized_records.length === 0,
      "HTTP 200 avec total_responses = 0",
      `HTTP ${res.statusCode} (total_responses: ${res.body?.summary?.total_responses})`
    );

    globalThis.fetch = originalFetch;
  }

  // 6. TEST : Calculs KPI, Déduplication Choix Multiples & Zéro Fuite PII
  {
    const mockSurveyRows = [
      {
        submission_id: "sub_test_01",
        timestamp: "2026-10-28T10:00:00.000Z",
        nom: "FOTSO", // Devrait être ignoré/absent
        prenom: "Jean",
        email: "jean.fotso@test.com",
        ville: "Douala",
        q1: "Douala",
        q2: "Quincaillerie / Matériaux",
        q3: "4 à 7 ans",
        q4: "2 à 3 personnes",
        q13: "Ruptures de stock; Ruptures de stock; Erreurs de caisse ou recettes manquantes", // Test déduplication multiple
        q14: "Oui, fréquemment",
        q15: "Plusieurs fois par semaine",
        q16: "Très souvent",
        q17: "Très souvent",
        q18: "Souvent",
        q22: "Oui (Montant: 50 000 FCFA)",
        q23: "Gestion automatique des stocks; Alertes de stock faible",
        q25: "Chiffre d'affaires du jour; Bénéfice estimé",
        q34: "Indispensable",
        q35: "Oui, certainement",
        q37: "5 000 à 9 999 FCFA",
        q41: "Oui, avec un abonnement réduit",
        q42: "Oui",
        q46: "Oui"
      },
      {
        submission_id: "sub_test_02",
        timestamp: "2026-10-29T14:30:00.000Z",
        nom: "KAMGA",
        prenom: "Paul",
        email: "paul.kamga@test.com",
        ville: "Yaoundé",
        q1: "Yaoundé",
        q2: "Boutique de quartier / Alimentation",
        q3: "1 à 3 ans",
        q4: "1 personne",
        q13: "Ruptures de stock; Difficultés à calculer les bénéfices",
        q14: "Rarement",
        q15: "Une ou deux fois",
        q16: "Parfois",
        q17: "Jamais",
        q18: "Jamais",
        q22: "Non",
        q23: "Enregistrement rapide des ventes; Gestion automatique des stocks",
        q25: "Chiffre d'affaires du jour",
        q34: "Très utile",
        q35: "Probablement",
        q37: "1 000 à 4 999 FCFA",
        q41: "Oui, gratuitement",
        q42: "Peut-être, après une démonstration",
        q46: "Non"
      }
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: "success",
        count: mockSurveyRows.length,
        data: mockSurveyRows
      })
    });

    const req = { method: 'GET', headers: { 'x-dashboard-key': 'test_password_123' }, query: { refresh: 'true' } };
    const res = createMockRes();
    await handler(req, res);

    const b = res.body;

    // A. Calculs globaux
    const isTotal2 = b.summary.total_responses === 2;
    const isPilote100 = b.summary.rate_pilote === 100; // Les 2 ont répondu Oui
    const isPayer100 = b.summary.rate_payer === 100; // 1 Oui, 1 Peut-être
    const isRecontact50 = b.summary.rate_recontact === 50; // 1 Oui sur 2
    assert(
      "6. Calculs KPI globaux (Total, Pilote, Payer, Recontact)",
      isTotal2 && isPilote100 && isPayer100 && isRecontact50,
      "Total=2, Pilote=100%, Payer=100%, Recontact=50%",
      `Total=${b?.summary?.total_responses}, Pilote=${b?.summary?.rate_pilote}%, Payer=${b?.summary?.rate_payer}%, Recontact=${b?.summary?.rate_recontact}%`
    );

    // B. Déduplication des choix multiples (Q13)
    // sub_01 a "Ruptures de stock" répété 2 fois dans sa chaîne -> doit compter pour 1 seul
    // sub_02 a aussi "Ruptures de stock" -> Total = 2 citations (100%)
    const rupturesItem = b.problemes_q13.find(p => p.label === "Ruptures de stock");
    const isDeduplicated = rupturesItem && rupturesItem.count === 2 && rupturesItem.pct === 100;
    assert(
      "7. Déduplication des choix multiples (Chaque répondant compté max 1 fois)",
      isDeduplicated,
      "Ruptures de stock : count = 2, pct = 100%",
      `Ruptures de stock : count = ${rupturesItem?.count}, pct = ${rupturesItem?.pct}%`
    );

    // C. Confidentialité & Zéro fuite PII
    // Vérifier que nom, prenom, email n'existent dans AUCUN enregistrement anonymisé
    let piiFound = false;
    b.anonymized_records.forEach(r => {
      if (r.nom || r.prenom || r.email) piiFound = true;
    });
    assert(
      "8. Confidentialité stricte : Zéro fuite de données personnelles (PII)",
      !piiFound,
      "Aucun nom, prénom ou email dans anonymized_records",
      `Données PII détectées : ${piiFound}`
    );

    // D. Gestion des valeurs manquantes / filtres
    const isDoualaFound = b.demographics.villes.some(v => v.label === "Douala" && v.count === 1);
    const isYaoundeFound = b.demographics.villes.some(v => v.label === "Yaoundé" && v.count === 1);
    assert(
      "9. Agrégations de segmentation démographique (Villes & Secteurs)",
      isDoualaFound && isYaoundeFound,
      "Douala: 1, Yaoundé: 1",
      `Villes trouvées : ${JSON.stringify(b.demographics.villes)}`
    );

    // E. Chronologie (Timeline quotidienne)
    const isTimelineOk = b.timeline.length === 2 && b.timeline[0].count === 1 && b.timeline[1].count === 1;
    assert(
      "10. Chronologie des soumissions par jour (Timeline)",
      isTimelineOk,
      "2 jours distincts avec 1 réponse chacun",
      `Timeline : ${JSON.stringify(b.timeline)}`
    );

    globalThis.fetch = originalFetch;
  }

  console.log("\n==========================================================");
  console.log("SYNTHÈSE DES TESTS DASHBOARD");
  console.log("==========================================================");
  console.log(`Total des tests : ${passed + failed}`);
  console.log(`Tests Réussis   : ${passed}`);
  console.log(`Tests Échoués   : ${failed}`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();

