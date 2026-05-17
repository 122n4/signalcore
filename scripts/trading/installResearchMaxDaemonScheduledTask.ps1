Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$paths = Get-ResearchPaths
$taskName = "Signalcore Research Max Daemon"
$cmdPath = "$env:WINDIR\System32\cmd.exe"
$actionArguments = "/c npm run research:max-daemon:once"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 6) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$action = New-ScheduledTaskAction -Execute $cmdPath -Argument $actionArguments -WorkingDirectory $paths.RepoRoot

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs Syntrake research max maintenance: staged market data backfill, expansion study, and runtime health snapshots." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

[pscustomobject]@{
  task_name = $taskName
  schedule = "every 6 hours"
  action = "`"$cmdPath`" $actionArguments"
  repo_root = $paths.RepoRoot
} | ConvertTo-Json -Depth 5
