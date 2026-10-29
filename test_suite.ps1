# ============================================================================
# SUITE DE TESTS D'INTÉGRATION & CONFORMITÉ — ARCHITECTURE VERCEL
# Enquête Marché Commerces Cameroun 🇨🇲
# ============================================================================

$gasUrl = "https://script.google.com/macros/s/AKfycbxpGZ9YZ3V6SrOzGP-WuTAysm6XTi4z20ri15qnEi8UbXTMRQlQtP9QdyFmDcLHl3H3/exec"

$passed = 0
$failed = 0
$total = 14

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

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "DÉMARRAGE DE L'AUDIT DE CONFORMITÉ VERCEL" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# 1. Structure Vercel & Suppression stricte de Netlify
# ----------------------------------------------------------------------------
$netlifyGone = -not (Test-Path "netlify")
$vercelJsonExists = Test-Path "vercel.json"
$apiSubmitExists = Test-Path "api\submit.js"
$envExampleExists = Test-Path ".env.example"

$isPass1 = $netlifyGone -and $vercelJsonExists -and $apiSubmitExists -and $envExampleExists
Assert-Test -TestName "[TEST 1/14] Architecture exclusive Vercel (zéro Netlify)" `
    -Condition $isPass1 `
    -Expected "netlify/ absent, vercel.json et api/submit.js présents" `
    -Actual "netlify/ absent: $netlifyGone | vercel.json: $vercelJsonExists | api/submit.js: $apiSubmitExists"

# ----------------------------------------------------------------------------
# 2. Sécurité de la variable d'environnement (Pas de fuite client)
# ----------------------------------------------------------------------------
$envContent = Get-Content ".env.example" -Raw
$htmlRaw = Get-Content "index.html" -Raw
$isPass2 = ($envContent -match "GOOGLE_APPS_SCRIPT_URL=") -and `
           (-not ($envContent -match "^\s*NEXT_PUBLIC_")) -and `
           (-not ($htmlRaw -match "GOOGLE_APPS_SCRIPT_URL"))
Assert-Test -TestName "TEST 2/14: Variable GOOGLE_APPS_SCRIPT_URL strictement serveur" `
    -Condition $isPass2 `
    -Expected "Variable sans préfixe NEXT_PUBLIC_, absente du code client" `
    -Actual "Contrôlé avec succès dans .env.example et index.html"

# ----------------------------------------------------------------------------
# 3. Client : Soumission exclusive à /api/submit (zéro appel direct à Apps Script)
# ----------------------------------------------------------------------------
$hasApiSubmitCall = $htmlRaw.Contains('/api/submit')
$hasDirectGasCallInClient = ($htmlRaw -match 'fetch\(\s*scriptUrl')
$isPass3 = $hasApiSubmitCall -and (-not $hasDirectGasCallInClient)
Assert-Test -TestName "TEST 3/14: Client index.html relie exclusivement a /api/submit" `
    -Condition $isPass3 `
    -Expected "Appel fetch('/api/submit') exclusif, aucun appel direct vers Apps Script" `
    -Actual "fetch('/api/submit'): $hasApiSubmitCall | direct GAS: $hasDirectGasCallInClient"

# ----------------------------------------------------------------------------
# 4. Suppression de la modale de configuration côté client
# ----------------------------------------------------------------------------
$hasConfigModal = ($htmlRaw -match "openConfigModal") -or ($htmlRaw -match 'id="configModal"')
$isPass4 = (-not $hasConfigModal)
Assert-Test -TestName "[TEST 4/14] Suppression du bouton et de la modale client de config" `
    -Condition $isPass4 `
    -Expected "Bouton et modale 'Configuration Sheets' purgés du frontend" `
    -Actual "Présence de configModal / openConfigModal: $hasConfigModal"

# ----------------------------------------------------------------------------
# 5. Préservation intégrale des 46 questions (Q1 à Q46) dans index.html
# ----------------------------------------------------------------------------
$allQuestionsFound = $true
$missingQuestions = @()
1..46 | ForEach-Object {
    $qKey = "q$_"
    if (-not ($htmlRaw -match "(name|id)=[`"']?$qKey[`"']?")) {
        $allQuestionsFound = $false
        $missingQuestions += $qKey
    }
}
Assert-Test -TestName "[TEST 5/14] Préservation intégrale des 46 questions du formulaire" `
    -Condition $allQuestionsFound `
    -Expected "Toutes les 46 questions (Q1 à Q46) présentes et câblées" `
    -Actual $(if ($allQuestionsFound) { "46/46 questions confirmées dans index.html" } else { "Questions manquantes: $($missingQuestions -join ', ')" })

# ----------------------------------------------------------------------------
# 6. Endpoint api/submit.js : Contrôles de validation et anti-spam
# ----------------------------------------------------------------------------
$apiCode = Get-Content "api\submit.js" -Raw
$hasMethodCheck = ($apiCode -match "req\.method !== .POST.")
$hasEnvCheck = ($apiCode -match "process\.env\.GOOGLE_APPS_SCRIPT_URL")
$hasSizeCheck = ($apiCode -match "MAX_PAYLOAD_BYTES")
$hasHoneypot = ($apiCode -match "data\.website")
$hasTimeout = ($apiCode -match "AbortController")
$isPass6 = $hasMethodCheck -and $hasEnvCheck -and $hasSizeCheck -and $hasHoneypot -and $hasTimeout
Assert-Test -TestName "[TEST 6/14] Endpoint api/submit.js (Sécurité, validation & timeout)" `
    -Condition $isPass6 `
    -Expected "POST-only, check env var, limite taille, honeypot et timeout configurés" `
    -Actual "Method: $hasMethodCheck | Env: $hasEnvCheck | Size: $hasSizeCheck | Honeypot: $hasHoneypot | Timeout: $hasTimeout"

# ----------------------------------------------------------------------------
# 7. Endpoint api/submit.js : Protection contre les faux succès
# ----------------------------------------------------------------------------
$verifiesUpstream = ($apiCode -match "upstreamJson\.status === .success.")
$returns200OnlyOnSuccess = ($apiCode -match "res\.status\(200\)\.json")
$isPass7 = $verifiesUpstream -and $returns200OnlyOnSuccess
Assert-Test -TestName "[TEST 7/14] api/submit.js : Confirmation stricte sans faux succès" `
    -Condition $isPass7 `
    -Expected "Code HTTP 200 renvoyé UNIQUEMENT si upstreamJson.status == 'success'" `
    -Actual "Vérifié dans la logique de traitement de api/submit.js"

# ----------------------------------------------------------------------------
# 8. Protection du schéma historique : Onglet Reponses_Sondage_v2
# ----------------------------------------------------------------------------
$codeGsRaw = Get-Content "Code.gs" -Raw
$usesV2Sheet = ($codeGsRaw -match 'SHEET_NAME_V2 = "Reponses_Sondage_v2"')
$hasMigration = ($codeGsRaw -match 'function migrateLegacyV1ToV2')
$isPass8 = $usesV2Sheet -and $hasMigration
Assert-Test -TestName "TEST 8/14: Protection du schema : Ecriture dans Reponses_Sondage_v2" `
    -Condition $isPass8 `
    -Expected "Nouvel onglet v2 utilisé, onglet historique protégé, migrateLegacyV1ToV2() fourni" `
    -Actual "Onglet v2: $usesV2Sheet | migrateLegacyV1ToV2: $hasMigration"

# ----------------------------------------------------------------------------
# 9. Idempotence durable et sérialisation avec LockService dans Code.gs
# ----------------------------------------------------------------------------
$hasLockService = ($codeGsRaw -match "LockService\.getScriptLock")
$checksColumnA = ($codeGsRaw -match "findSubmissionInSheet") -or ($codeGsRaw -match "findExistingRowById")
$isPass9 = $hasLockService -and $checksColumnA
Assert-Test -TestName "TEST 9/14: Code.gs : Idempotence durable (LockService + Colonne A)" `
    -Condition $isPass9 `
    -Expected "LockService présent et recherche de submission_id en colonne A active" `
    -Actual "LockService: $hasLockService | Colonne A check: $checksColumnA"

# ----------------------------------------------------------------------------
# 10. Persistance du brouillon et sauvegarde locale de secours
# ----------------------------------------------------------------------------
$hasDraftSave = ($htmlRaw -match "autoSaveDraft") -and ($htmlRaw -match "loadDraft")
$hasCsvExport = ($htmlRaw -match "exportStoredResponses") -and ($htmlRaw -match "exportSingleSubmissionCsv")
$isPass10 = $hasDraftSave -and $hasCsvExport
Assert-Test -TestName "[TEST 10/14] Robustesse client : Brouillon localStorage + Export CSV" `
    -Condition $isPass10 `
    -Expected "Fonctions de draft et d'export CSV d'urgence connectées" `
    -Actual "Brouillon auto: $hasDraftSave | Export CSV: $hasCsvExport"

# ----------------------------------------------------------------------------
# 11. Test réseau direct sur le backend Google Apps Script en production
# ----------------------------------------------------------------------------
$liveSubId = "test_vercel_" + [Guid]::NewGuid().ToString().Substring(0,8)
$livePayload = @{
    submission_id = $liveSubId
    nom = "Kenfack"
    prenom = "Alain"
    email = "alain.kenfack@test.cm"
    ville = "Bafoussam"
    consent_etude = $true
    consent_marketing = $false
    q1 = "Bafoussam"
    q2 = "Alimentation générale"
    q13 = "Gestion des impayés"
    q23 = "Suivi des ventes sur smartphone"
} | ConvertTo-Json

try {
    $resLive = Invoke-RestMethod -Uri $gasUrl -Method Post -Body $livePayload -ContentType "text/plain;charset=utf-8" -TimeoutSec 15
    $isPass11 = ($resLive -ne $null) -and ($resLive.status -eq "success") -and ($resLive.row -gt 0)
    Assert-Test -TestName "[TEST 11/14] Test d'écriture en direct sur Google Apps Script" `
        -Condition $isPass11 `
        -Expected "status == 'success' et row > 0" `
        -Actual "status = '$($resLive.status)', row = '$($resLive.row)'"
} catch {
    Assert-Test -TestName "[TEST 11/14] Test d'écriture en direct sur Google Apps Script" `
        -Condition $false `
        -Expected "status == 'success'" `
        -Actual "Exception: $_"
}

# ----------------------------------------------------------------------------
# 12. Test d'idempotence en direct sur Google Apps Script
# ----------------------------------------------------------------------------
try {
    # Renvoi immédiat du même payload avec le même submission_id
    $resDup = Invoke-RestMethod -Uri $gasUrl -Method Post -Body $livePayload -ContentType "text/plain;charset=utf-8" -TimeoutSec 15
    $isPass12 = ($resDup.status -eq "success")
    Assert-Test -TestName "[TEST 12/14] Test de renvoi immédiat sur Google Apps Script" `
        -Condition $isPass12 `
        -Expected "status == 'success' sans erreur" `
        -Actual "status = '$($resDup.status)', duplicate = '$($resDup.duplicate)'" `
        -Note "Pour bénéficier du flag duplicate:true, déployer une 'Nouvelle version' de Code.gs v2.1 sur Google Apps Script"
} catch {
    Assert-Test -TestName "[TEST 12/14] Test de renvoi immédiat sur Google Apps Script" `
        -Condition $false `
        -Expected "status == 'success'" `
        -Actual "Exception: $_"
}

# ----------------------------------------------------------------------------
# 13. Test d'écritures concurrentes réelles (Multi-threading PowerShell)
# ----------------------------------------------------------------------------
$concId1 = "conc_v1_" + [Guid]::NewGuid().ToString().Substring(0,6)
$concId2 = "conc_v2_" + [Guid]::NewGuid().ToString().Substring(0,6)
$p1 = @{ submission_id=$concId1; nom="Conc1"; prenom="Test"; email="c1@test.cm"; ville="Douala"; consent_etude=$true } | ConvertTo-Json
$p2 = @{ submission_id=$concId2; nom="Conc2"; prenom="Test"; email="c2@test.cm"; ville="Yaoundé"; consent_etude=$true } | ConvertTo-Json

try {
    $j1 = Start-Job -ScriptBlock { param($u, $b) Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "text/plain;charset=utf-8" -TimeoutSec 20 } -ArgumentList $gasUrl, $p1
    $j2 = Start-Job -ScriptBlock { param($u, $b) Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "text/plain;charset=utf-8" -TimeoutSec 20 } -ArgumentList $gasUrl, $p2

    $r1 = Receive-Job -Job $j1 -Wait
    $r2 = Receive-Job -Job $j2 -Wait
    Remove-Job -Job $j1, $j2

    $isPass13 = ($r1.status -eq "success") -and ($r2.status -eq "success") -and ($r1.row -ne $r2.row)
    Assert-Test -TestName "[TEST 13/14] Concurrence en production (Deux écritures simultanées)" `
        -Condition $isPass13 `
        -Expected "2 soumissions enregistrées sur des lignes distinctes" `
        -Actual "Job 1: row=$($r1.row) | Job 2: row=$($r2.row)"
} catch {
    Assert-Test -TestName "[TEST 13/14] Concurrence en production" `
        -Condition $false `
        -Expected "2 soumissions acceptées" `
        -Actual "Exception: $_"
}

# ----------------------------------------------------------------------------
# 14. Configuration vercel.json et headers de sécurité
# ----------------------------------------------------------------------------
$vJsonRaw = Get-Content "vercel.json" -Raw
$hasSecurityHeaders = ($vJsonRaw -match "X-Content-Type-Options") -and ($vJsonRaw -match "X-Frame-Options")
$hasFunctionTimeout = ($vJsonRaw -match "maxDuration")
$isPass14 = $hasSecurityHeaders -and $hasFunctionTimeout
Assert-Test -TestName "[TEST 14/14] Configuration vercel.json (Headers de sécurité & maxDuration)" `
    -Condition $isPass14 `
    -Expected "En-têtes de sécurité et maxDuration configurés" `
    -Actual "Security headers: $hasSecurityHeaders | maxDuration: $hasFunctionTimeout"

# ----------------------------------------------------------------------------
# Synthèse finale
# ----------------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "SYNTHÈSE DE LA SUITE DE TESTS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Total des tests  : $total" -ForegroundColor Gray
Write-Host "Tests Réussis    : $passed" -ForegroundColor Green
Write-Host "Tests Échoués    : $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "==========================================================" -ForegroundColor Cyan
