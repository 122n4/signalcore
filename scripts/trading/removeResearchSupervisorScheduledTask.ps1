Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "Signalcore Research Supervisor"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

[pscustomobject]@{
  task_name = $taskName
  removed = $true
} | ConvertTo-Json -Depth 5
