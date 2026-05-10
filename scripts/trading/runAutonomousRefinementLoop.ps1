$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$artifactsDir = Join-Path $repoRoot "artifacts/trading-backtests"
$logPath = Join-Path $artifactsDir "trading-autonomous-refinement-loop.log"
$summaryPath = Join-Path $artifactsDir "trading-autonomous-refinement-loop-summary.json"

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

function Write-Log {
  param(
    [string]$Message
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Add-Content -Path $logPath -Value $line
}

function Get-RefinementVitestProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and $_.CommandLine -match "tests/tradingRefinementRiskStudy\.test\.ts"
    }
}

function Wait-ForActiveRefinementRunToFinish {
  while ($true) {
    $processes = @(Get-RefinementVitestProcesses)
    if ($processes.Count -eq 0) {
      return
    }

    $processIds = ($processes | Select-Object -ExpandProperty ProcessId) -join ", "
    Write-Log "Waiting for active refinement run to finish. PIDs: $processIds"
    Start-Sleep -Seconds 60
  }
}

function Run-ActualWalkForwardCandidate {
  param(
    [string]$CandidateId
  )

  Write-Log "Starting actual walk-forward for candidate '$CandidateId'."

  Push-Location $repoRoot
  try {
    $env:RUN_TRADING_REFINEMENT_RISK_ACTUAL_WF = "1"
    $env:TRADING_REFINEMENT_RISK_SCENARIO_ID = $CandidateId
    & npx vitest run tests/tradingRefinementRiskStudy.test.ts
    if ($LASTEXITCODE -ne 0) {
      throw "vitest failed for candidate '$CandidateId' with exit code $LASTEXITCODE."
    }
  }
  finally {
    Remove-Item Env:RUN_TRADING_REFINEMENT_RISK_ACTUAL_WF -ErrorAction SilentlyContinue
    Remove-Item Env:TRADING_REFINEMENT_RISK_SCENARIO_ID -ErrorAction SilentlyContinue
    Pop-Location
  }
}

function Read-CandidateArtifact {
  param(
    [string]$CandidateId
  )

  $artifactPath = Join-Path $artifactsDir "trading-refinement-risk-study-actual-walk-forward-$CandidateId.json"
  if (-not (Test-Path $artifactPath)) {
    return $null
  }

  $json = Get-Content $artifactPath -Raw | ConvertFrom-Json
  $scenario = $json.scenarios | Select-Object -First 1
  $keepableIds = @(
    $json.keepableScenarios |
      ForEach-Object {
        if ($_ -is [string]) {
          $_
        }
        elseif ($null -ne $_.id) {
          $_.id
        }
      }
  )

  [pscustomobject]@{
    candidateId = $CandidateId
    artifactPath = $artifactPath
    keepable = $keepableIds -contains $CandidateId
    gates = $scenario.gates
    aggregate = $scenario.aggregate.current
    crisis = $scenario.crisis.current
    walkForward = $scenario.walkForward.current
  }
}

$candidates = @(
  "xauusd_btcusd_breakout_weak_sessions_half_risk",
  "xauusd_breakout_london_open_half_risk",
  "btcusd_breakout_weekend_drift_half_risk"
)

Write-Log "Autonomous refinement loop started."

$results = @()

foreach ($candidateId in $candidates) {
  Wait-ForActiveRefinementRunToFinish

  $candidateArtifact = Read-CandidateArtifact -CandidateId $candidateId
  if ($null -eq $candidateArtifact) {
    Run-ActualWalkForwardCandidate -CandidateId $candidateId
    $candidateArtifact = Read-CandidateArtifact -CandidateId $candidateId
  }

  if ($null -eq $candidateArtifact) {
    Write-Log "Artifact missing after run for '$CandidateId'. Stopping loop."
    break
  }

  $results += $candidateArtifact

  $aggregateExpectancy = [double]$candidateArtifact.aggregate.expectancy
  $crisisExpectancy = [double]$candidateArtifact.crisis.expectancy
  $walkForwardExpectancy = [double]$candidateArtifact.walkForward.expectancy
  $aggregatePf = [double]$candidateArtifact.aggregate.profitFactor
  $crisisPf = [double]$candidateArtifact.crisis.profitFactor
  $walkForwardPf = [double]$candidateArtifact.walkForward.profitFactor

  Write-Log (
    "Candidate '$CandidateId' finished. keepable=$($candidateArtifact.keepable); " +
    "aggregateExp=$aggregateExpectancy; aggregatePF=$aggregatePf; " +
    "crisisExp=$crisisExpectancy; crisisPF=$crisisPf; " +
    "walkForwardExp=$walkForwardExpectancy; walkForwardPF=$walkForwardPf"
  )

  if ($candidateArtifact.keepable) {
    Write-Log "Candidate '$CandidateId' passed all gates. Stopping loop for manual review."
    break
  }
}

$results |
  ConvertTo-Json -Depth 8 |
  Set-Content -Path $summaryPath

Write-Log "Autonomous refinement loop finished."
