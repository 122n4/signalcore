Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "Signalcore Research Max Daemon"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  [pscustomobject]@{
    task_name = $taskName
    removed = $true
  } | ConvertTo-Json -Depth 5
  exit 0
}

[pscustomobject]@{
  task_name = $taskName
  removed = $false
  reason = "not_found"
} | ConvertTo-Json -Depth 5
