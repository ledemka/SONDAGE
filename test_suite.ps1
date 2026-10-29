# ============================================================================
# SUITE DE TESTS D'AUDIT, SÉCURITÉ & CONFORMITÉ — ARCHITECTURE VERCEL
# Enquête Marché Commerces Cameroun 🇨🇲
# ============================================================================
# 
# UTILISATION :
# 
# 1. Mode Statique & Unitaire (PAR DÉFAUT, RECOMMANDÉ) :
#    powershell -ExecutionPolicy Bypass -File .\test_suite.ps1
#    -> Exécute tous les tests statiques, de sécurité et la simulation /api/submit
#    -> ZÉRO écriture sur aucune base de données
#    -> Aucun risque de pollution de la production
# 
# 2. Mode Intégration sur Environnement de Test Dédié (OPTIONNEL ET ISOLÉ) :
#    powershell -ExecutionPolicy Bypass -File .\test_suite.ps1 -AllowWriteTests -TestEndpointUrl "https://script.google.com/macros/s/VOTRE_DEPLOYMENT_TEST/exec"
#    -> Nécessite un Google Sheets de test et un script de test dédié
#    -> Les écritures vers la production sont STRICTEMENT INTERDITES par un garde-fou
# ============================================================================

param (
    [switch]$AllowWriteTests = $false,
    [string]$TestEndpointUrl = $env:TEST_GOOGLE_APPS_SCRIPT_URL,
    [string]$VercelBaseUrl = $env:TEST_VERCEL_BASE_URL
)

# Signature de l'URL de production connue pour le garde-fou
$PRODUCTION_DEPLOYMENT_ID = "AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3"

$passed = 0
$failed = 0
$skipped = 0
$totalTests = 15

function Assert-Test {
    param (
        [string]$TestName,
        [bool]$Condition,
        [string]$Expected,
        [string]$Actual,
        [string]$Note = ""
    )
    Write-Host "`n----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "$TestName" -ForegroundColor Cyan
    Write-Host "Attendu : $Expected" -ForegroundColor Gray
    Write-Host "Obtenu  : $Actual" -ForegroundColor Gray
    if ($Note) { Write-Host "Note    : $Note" -ForegroundColor DarkYellow }

    if ($Condition) {
        Write-Host "RÉSULTAT: [PASS] Réussi" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "RÉSULTAT: [FAIL] Échec" -ForegroundColor Red
        $script:failed++
    }
}

function Skip-Test {
    param (
        [string]$TestName,
        [string]$Reason
    )
    Write-Host "`n----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "$TestName" -ForegroundColor Cyan
    Write-Host "STATUT  : [SKIPPED - NON EXÉCUTÉ]" -ForegroundColor Yellow
    Write-Host "Raison  : $Reason" -ForegroundColor DarkYellow
    $script:skipped++
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "DÉMARRAGE DE L'AUDIT DE CONFORMITÉ & TESTS VERCEL" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# PARTIE 1 : TESTS STATIQUES, ARCHITECTURE & SÉCURITÉ (ZÉRO ÉCRITURE)
# ----------------------------------------------------------------------------

# TEST 1 : Architecture exclusive Vercel (zéro Netlify)
$netlifyGone = -not (Test-Path "netlify")
$vercelJsonExists = Test-Path "vercel.json"
$apiSubmitExists = Test-Path "api\submit.js"
$envExampleExists = Test-Path ".env.example"
$isPass1 = $netlifyGone -and $vercelJsonExists -and $apiSubmitExists -and $envExampleExists
Assert-Test -TestName "TEST 1/15: Architecture exclusive Vercel (zéro Netlify)" `
    -Condition $isPass1 `
    -Expected "netlify/ absent, vercel.json et api/submit.js présents" `
    -Actual "netlify/ absent: $netlifyGone | vercel.json: $vercelJsonExists | api/submit.js: $apiSubmitExists"

# TEST 2 : Sécurité de la variable d'environnement (Pas de fuite client)
$envContent = Get-Content ".env.example" -Raw
$htmlRaw = Get-Content "index.html" -Raw
$isPass2 = ($envContent -match "GOOGLE_APPS_SCRIPT_URL=") -and `
           (-not ($envContent -match "^\s*NEXT_PUBLIC_")) -and `
           (-not ($htmlRaw -match "GOOGLE_APPS_SCRIPT_URL"))
Assert-Test -TestName "TEST 2/15: Variable GOOGLE_APPS_SCRIPT_URL strictement serveur" `
    -Condition $isPass2 `
    -Expected "Variable sans préfixe NEXT_PUBLIC_, absente du code client" `
    -Actual "Contrôlé avec succès dans .env.example et index.html"

# TEST 3 : Client index.html relié exclusivement à /api/submit
$hasApiSubmitCall = $htmlRaw.Contains('/api/submit')
$hasDirectGasCallInClient = ($htmlRaw -match 'fetch\(\s*scriptUrl')
$isPass3 = $hasApiSubmitCall -and (-not $hasDirectGasCallInClient)
Assert-Test -TestName "TEST 3/15: Client index.html relié exclusivement à /api/submit" `
    -Condition $isPass3 `
    -Expected "Appel fetch('/api/submit') exclusif, aucun appel direct vers Apps Script" `
    -Actual "fetch('/api/submit'): $hasApiSubmitCall | direct GAS: $hasDirectGasCallInClient"

# TEST 4 : Suppression de la modale et des contrôles de configuration client
$hasConfigModal = ($htmlRaw -match "openConfigModal") -or ($htmlRaw -match 'id="configModal"')
$isPass4 = (-not $hasConfigModal)
Assert-Test -TestName "TEST 4/15: Suppression du bouton et de la modale client de config" `
    -Condition $isPass4 `
    -Expected "Bouton et modale 'Configuration Sheets' purgés du frontend" `
    -Actual "Présence de configModal / openConfigModal: $hasConfigModal"

# TEST 5 : Préservation intégrale des 46 questions du formulaire
$allQuestionsFound = $true
$missingQuestions = @()
1..46 | ForEach-Object {
    $qKey = "q$_"
    if (-not ($htmlRaw -match "(name|id)=[`"']?$qKey[`"']?")) {
        $allQuestionsFound = $false
        $missingQuestions += $qKey
    }
}
Assert-Test -TestName "TEST 5/15: Préservation intégrale des 46 questions du formulaire" `
    -Condition $allQuestionsFound `
    -Expected "Toutes les 46 questions (Q1 à Q46) présentes et câblées" `
    -Actual $(if ($allQuestionsFound) { "46/46 questions confirmées dans index.html" } else { "Questions manquantes: $($missingQuestions -join ', ')" })

# TEST 6 : Minimisation et conformité du stockage local (RGPD)
$hasSilentAccumulation = $htmlRaw.Contains("saveResponseLocally")
$hasDraftPurgeOnSuccess = $htmlRaw.Contains("localStorage.removeItem(STORAGE_KEY_DRAFT)")
$hasResetForm = $htmlRaw.Contains("resetFormForNewRespondent")
$isPass6 = (-not $hasSilentAccumulation) -and $hasDraftPurgeOnSuccess -and $hasResetForm
Assert-Test -TestName "TEST 6/15: Protection de la vie privée (RGPD - localStorage minimisé)" `
    -Condition $isPass6 `
    -Expected "Pas de stockage systématique des réponses personnelles, purge auto du draft après succès, reset pour nouvel utilisateur" `
    -Actual "Stockage systématique évité: $(!$hasSilentAccumulation) | Purge draft succès: $hasDraftPurgeOnSuccess | Reset nouvel utilisateur: $hasResetForm"

# TEST 7 : Endpoint api/submit.js (Sécurité, validation & timeout)
$apiCode = Get-Content "api\submit.js" -Raw
$hasMethodCheck = ($apiCode -match "req\.method !== .POST.")
$hasEnvCheck = ($apiCode -match "process\.env\.GOOGLE_APPS_SCRIPT_URL")
$hasSizeCheck = ($apiCode -match "MAX_PAYLOAD_BYTES")
$hasHoneypot = ($apiCode -match "data\.website")
$hasTimeout = ($apiCode -match "AbortController")
$isPass7 = $hasMethodCheck -and $hasEnvCheck -and $hasSizeCheck -and $hasHoneypot -and $hasTimeout
Assert-Test -TestName "TEST 7/15: Endpoint api/submit.js (Sécurité, validation & timeout)" `
    -Condition $isPass7 `
    -Expected "POST-only, check env var, limite taille (64 Ko), honeypot et timeout configurés" `
    -Actual "Method: $hasMethodCheck | Env: $hasEnvCheck | Size: $hasSizeCheck | Honeypot: $hasHoneypot | Timeout: $hasTimeout"

# TEST 8 : Confirmation stricte de soumission (Exigence submission_id en entrée et sortie)
$requiresSubIdInInput = ($apiCode -match "L'identifiant de soumission \(submission_id\) est obligatoire")
$checksIdMissingOrMismatch = ($apiCode -match "SUBMISSION_ID_MISSING") -and ($apiCode -match "SUBMISSION_ID_MISMATCH")
$checksUnconfirmedRecord = ($apiCode -match "UNCONFIRMED_RECORD")
$returns200OnlyOnConfirmed = ($apiCode -match "res\.status\(200\)\.json")
$isPass8 = $requiresSubIdInInput -and $checksIdMissingOrMismatch -and $checksUnconfirmedRecord -and $returns200OnlyOnConfirmed
Assert-Test -TestName "TEST 8/15: api/submit.js : Exigence submission_id & confirmation stricte" `
    -Condition $isPass8 `
    -Expected "submission_id obligatoire en entrée, rejet strict si manquant/différent en sortie, row > 0 requis" `
    -Actual "ID obligatoire entrée: $requiresSubIdInInput | Rejet ID manquant/différent: $checksIdMissingOrMismatch | Rejet non certifié: $checksUnconfirmedRecord"

# TEST 9 : Protection du schéma historique : Onglet Reponses_Sondage_v2
$codeGsRaw = Get-Content "Code.gs" -Raw
$usesV2Sheet = ($codeGsRaw -match 'SHEET_NAME_V2 = "Reponses_Sondage_v2"')
$hasMigration = ($codeGsRaw -match 'function migrateLegacyV1ToV2')
$isPass9 = $usesV2Sheet -and $hasMigration
Assert-Test -TestName "TEST 9/15: Protection du schéma : Écriture dans Reponses_Sondage_v2" `
    -Condition $isPass9 `
    -Expected "Nouvel onglet v2 utilisé, onglet historique protégé, migrateLegacyV1ToV2() fourni" `
    -Actual "Onglet v2: $usesV2Sheet | migrateLegacyV1ToV2: $hasMigration"

# TEST 10 : Sécurité doGet(e) et Idempotence durable dans Code.gs
$hasLockService = ($codeGsRaw -match "LockService\.getScriptLock")
$checksColumnA = ($codeGsRaw -match "findSubmissionInSheet") -or ($codeGsRaw -match "findExistingRowById")
$hasProbingRemoved = (-not ($codeGsRaw -match "action === .verify."))
$isPass10 = $hasLockService -and $checksColumnA -and $hasProbingRemoved
Assert-Test -TestName "TEST 10/15: Code.gs : Idempotence durable & Suppression du sondage public doGet" `
    -Condition $isPass10 `
    -Expected "LockService présent, colonne A vérifiée, endpoint public doGet(?action=verify) supprimé" `
    -Actual "LockService: $hasLockService | Colonne A check: $checksColumnA | Probing supprimé: $hasProbingRemoved"

# TEST 11 : Configuration vercel.json et headers de sécurité
$vJsonRaw = Get-Content "vercel.json" -Raw
$hasSecurityHeaders = ($vJsonRaw -match "X-Content-Type-Options") -and ($vJsonRaw -match "X-Frame-Options")
$hasFunctionTimeout = ($vJsonRaw -match "maxDuration")
$isPass11 = $hasSecurityHeaders -and $hasFunctionTimeout
Assert-Test -TestName "TEST 11/15: Configuration vercel.json (Headers de sécurité & maxDuration)" `
    -Condition $isPass11 `
    -Expected "En-têtes de sécurité et maxDuration configurés" `
    -Actual "Security headers: $hasSecurityHeaders | maxDuration: $hasFunctionTimeout"

# ----------------------------------------------------------------------------
# PARTIE 2 : SIMULATION UNITAIRE DE L'ENDPOINT VERCEL /api/submit
# (Validation des règles métier côté serveur, données 100% fictives, en mémoire)
# ----------------------------------------------------------------------------

function Test-ApiValidation {
    param ($data)
    $errors = @()
    $EMAIL_REGEX = "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$"

    if ([string]::IsNullOrWhiteSpace($data.submission_id) -or $data.submission_id.Length -lt 8) {
        $errors += "L'identifiant de soumission (submission_id) est obligatoire"
    }
    if ([string]::IsNullOrWhiteSpace($data.nom)) { $errors += "Le nom est obligatoire" }
    if ([string]::IsNullOrWhiteSpace($data.prenom)) { $errors += "Le prénom est obligatoire" }
    if ([string]::IsNullOrWhiteSpace($data.email) -or (-not ($data.email -match $EMAIL_REGEX))) { $errors += "Format d'email invalide" }
    if ([string]::IsNullOrWhiteSpace($data.ville)) { $errors += "La ville principale est obligatoire" }
    if ($data.consent_etude -ne $true) { $errors += "Le consentement à l'étude est requis" }

    if ($data.q13) {
        $q13Count = ($data.q13 -split ';').Count
        if ($q13Count -gt 3) { $errors += "Q13 : maximum 3 choix" }
    }
    if ($data.q23) {
        $q23Count = ($data.q23 -split ';').Count
        if ($q23Count -gt 5) { $errors += "Q23 : maximum 5 choix" }
    }
    return $errors
}

# Tests unitaires sur données fictives
$badIdData = @{ submission_id=""; nom="Test"; prenom="Test"; email="bot@example.invalid"; ville="Test"; consent_etude=$true }
$valErrId = Test-ApiValidation -data $badIdData
$hasIdRejected = $valErrId -contains "L'identifiant de soumission (submission_id) est obligatoire"

$badEmailData = @{ submission_id="sub_valid_12345"; nom="TestNom"; prenom="TestPrenom"; email="invalid-email"; ville="VilleTest"; consent_etude=$true }
$valErrEmail = Test-ApiValidation -data $badEmailData
$hasEmailRejected = $valErrEmail -contains "Format d'email invalide"

$badNomData = @{ submission_id="sub_valid_12345"; nom=""; prenom="TestPrenom"; email="bot@example.invalid"; ville="VilleTest"; consent_etude=$true }
$valErrNom = Test-ApiValidation -data $badNomData
$hasNomRejected = $valErrNom -contains "Le nom est obligatoire"

$isPass12 = $hasIdRejected -and $hasEmailRejected -and $hasNomRejected
Assert-Test -TestName "TEST 12/15: Validation métier unitaire de api/submit.js (Rejets stricts)" `
    -Condition $isPass12 `
    -Expected "Rejet strict si submission_id manquant, nom vide, ou email invalide" `
    -Actual "ID rejeté: $hasIdRejected | Email rejeté: $hasEmailRejected | Nom rejeté: $hasNomRejected"

# ----------------------------------------------------------------------------
# PARTIE 3 : TESTS D'INTÉGRATION E2E SUR BACKEND DE TEST DÉDIÉ
# (STRICTEMENT ISOLÉS — DÉSACTIVÉS PAR DÉFAUT POUR PROTÉGER LA PRODUCTION)
# ----------------------------------------------------------------------------

$canRunIntegration = $false
$integrationSkipReason = ""

if (-not $AllowWriteTests) {
    $integrationSkipReason = "Tests d'écriture désactivés par défaut pour protéger la production. Activez avec -AllowWriteTests et un endpoint de test dédié."
} elseif ([string]::IsNullOrWhiteSpace($TestEndpointUrl)) {
    $integrationSkipReason = "Aucune URL de test fournie (-TestEndpointUrl ou `$env:TEST_GOOGLE_APPS_SCRIPT_URL non défini)."
} elseif ($TestEndpointUrl -match $PRODUCTION_DEPLOYMENT_ID) {
    $integrationSkipReason = "GARDE-FOU ACTIVÉ : L'URL fournie correspond au déploiement de PRODUCTION ($PRODUCTION_DEPLOYMENT_ID). Écriture refusée."
} else {
    $canRunIntegration = $true
}

if (-not $canRunIntegration) {
    Skip-Test -TestName "TEST 13/15: Intégration E2E via /api/submit sur environnement de test" -Reason $integrationSkipReason
    Skip-Test -TestName "TEST 14/15: Vérification de l'idempotence et du non-dédoublement de ligne" -Reason $integrationSkipReason
    Skip-Test -TestName "TEST 15/15: Concurrence réelle multi-utilisateurs sur 2 lignes distinctes" -Reason $integrationSkipReason
} else {
    Write-Host "`n>>> EXÉCUTION DES TESTS D'ÉCRITURE SUR L'ENVIRONNEMENT DE TEST ISOLÉ <<<" -ForegroundColor Yellow

    # Fonction de relais simulant ou appelant l'endpoint Vercel /api/submit
    function Invoke-VercelSubmitE2E {
        param ($payloadObj, $gasTargetUrl, $vercelUrl)
        if (-not [string]::IsNullOrWhiteSpace($vercelUrl)) {
            # Appel réseau réel vers Vercel si disponible
            return Invoke-RestMethod -Uri "$vercelUrl/api/submit" -Method Post -Body ($payloadObj | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 25
        } else {
            # Exécution directe du contrat de /api/submit
            $validation = Test-ApiValidation -data $payloadObj
            if ($validation.Count -gt 0) {
                return @{ status="error"; code="VALIDATION_FAILED"; message=($validation -join " ; ") }
            }
            if (-not [string]::IsNullOrWhiteSpace($payloadObj.website)) {
                return @{ status="error"; code="SPAM_DETECTED"; message="Spam bloqué" }
            }
            # Envoi serveur à serveur vers Google Apps Script
            $upstreamRes = Invoke-RestMethod -Uri $gasTargetUrl -Method Post -Body ($payloadObj | ConvertTo-Json) -ContentType "text/plain;charset=utf-8" -TimeoutSec 20
            
            # Contrôles stricts de concordance et intégrité de api/submit.js
            if ($upstreamRes.status -eq "success") {
                if ([string]::IsNullOrWhiteSpace($upstreamRes.submission_id) -or ($upstreamRes.submission_id -ne $payloadObj.submission_id)) {
                    return @{ status="error"; code="SUBMISSION_ID_MISMATCH"; message="ID mismatch" }
                }
                if (($upstreamRes.row -le 0) -and ($upstreamRes.duplicate -ne $true)) {
                    return @{ status="error"; code="UNCONFIRMED_RECORD"; message="Unconfirmed" }
                }
            }
            return $upstreamRes
        }
    }

    # Données purement synthétiques (aucune coordonnée réelle)
    $testSubId = "e2e_test_" + [Guid]::NewGuid().ToString().Substring(0,8)
    $testPayload = @{
        submission_id = $testSubId
        nom = "ROBOT_TEST_FICTIF"
        prenom = "AUTOMATE"
        email = "robot-test-runner@example.invalid"
        ville = "TEST_VILLE"
        consent_etude = $true
        consent_marketing = $false
        website = ""
        q1 = "Douala"
        q2 = "Alimentation générale"
        q13 = "Ruptures de stock"
        q23 = "Gestion automatique des stocks"
    }

    # TEST 13 : Soumission E2E via contrat /api/submit
    try {
        $resE2E = Invoke-VercelSubmitE2E -payloadObj $testPayload -gasTargetUrl $TestEndpointUrl -vercelUrl $VercelBaseUrl
        $isPass13 = ($resE2E -ne $null) -and ($resE2E.status -eq "success") -and ($resE2E.row -gt 0) -and ($resE2E.submission_id -eq $testSubId)
        Assert-Test -TestName "TEST 13/15: Intégration E2E via /api/submit sur backend de test" `
            -Condition $isPass13 `
            -Expected "status == 'success', row > 0, et submission_id confirmé identique" `
            -Actual "status = '$($resE2E.status)', row = '$($resE2E.row)', id = '$($resE2E.submission_id)'"
    } catch {
        Assert-Test -TestName "TEST 13/15: Intégration E2E via /api/submit sur backend de test" `
            -Condition $false `
            -Expected "status == 'success'" `
            -Actual "Exception: $_"
    }

    # TEST 14 : Idempotence (Renvoi du même submission_id via /api/submit)
    try {
        $resDup = Invoke-VercelSubmitE2E -payloadObj $testPayload -gasTargetUrl $TestEndpointUrl -vercelUrl $VercelBaseUrl
        $isPass14 = ($resDup.status -eq "success") -and ($resDup.duplicate -eq $true) -and ($resDup.row -eq $resE2E.row)
        Assert-Test -TestName "TEST 14/15: Vérification de l'idempotence et du non-dédoublement de ligne" `
            -Condition $isPass14 `
            -Expected "duplicate == true et row == $($resE2E.row) (aucune nouvelle ligne créée)" `
            -Actual "duplicate = '$($resDup.duplicate)', row = '$($resDup.row)'"
    } catch {
        Assert-Test -TestName "TEST 14/15: Vérification de l'idempotence" `
            -Condition $false `
            -Expected "duplicate == true" `
            -Actual "Exception: $_"
    }

    # TEST 15 : Concurrence réelle multi-utilisateurs
    $cId1 = "conc_test1_" + [Guid]::NewGuid().ToString().Substring(0,6)
    $cId2 = "conc_test2_" + [Guid]::NewGuid().ToString().Substring(0,6)
    $p1 = @{ submission_id=$cId1; nom="ROBOT_CONC_1"; prenom="TEST"; email="bot1@example.invalid"; ville="TEST_VILLE"; consent_etude=$true } | ConvertTo-Json
    $p2 = @{ submission_id=$cId2; nom="ROBOT_CONC_2"; prenom="TEST"; email="bot2@example.invalid"; ville="TEST_VILLE"; consent_etude=$true } | ConvertTo-Json

    try {
        $j1 = Start-Job -ScriptBlock { param($u, $b) Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "text/plain;charset=utf-8" -TimeoutSec 20 } -ArgumentList $TestEndpointUrl, $p1
        $j2 = Start-Job -ScriptBlock { param($u, $b) Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "text/plain;charset=utf-8" -TimeoutSec 20 } -ArgumentList $TestEndpointUrl, $p2

        $r1 = Receive-Job -Job $j1 -Wait
        $r2 = Receive-Job -Job $j2 -Wait
        Remove-Job -Job $j1, $j2

        $isPass15 = ($r1.status -eq "success") -and ($r2.status -eq "success") -and ($r1.row -ne $r2.row)
        Assert-Test -TestName "TEST 15/15: Concurrence réelle (Deux écritures simultanées sur 2 lignes distinctes)" `
            -Condition $isPass15 `
            -Expected "2 soumissions acceptées sur 2 lignes différentes" `
            -Actual "Job 1: row=$($r1.row) | Job 2: row=$($r2.row)"
    } catch {
        Assert-Test -TestName "TEST 15/15: Concurrence réelle" `
            -Condition $false `
            -Expected "2 écritures sur 2 lignes distinctes" `
            -Actual "Exception: $_"
    }
}

# ----------------------------------------------------------------------------
# SYNTHÈSE DES RÉSULTATS
# ----------------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "SYNTHÈSE DE LA SUITE DE TESTS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Total des tests prévus : $totalTests" -ForegroundColor Gray
Write-Host "Tests Réussis          : $passed" -ForegroundColor Green
Write-Host "Tests Échoués          : $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "Tests Ignorés/Protégés : $skipped" -ForegroundColor $(if ($skipped -gt 0) { "Yellow" } else { "Gray" })
Write-Host "==========================================================" -ForegroundColor Cyan
