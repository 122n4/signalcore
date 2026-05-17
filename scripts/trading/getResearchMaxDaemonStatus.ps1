Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$paths = Get-ResearchPaths
$taskName = "Signalcore Research Max Daemon"
$statusPath = Join-Path $paths.RuntimeDir "research-max-daemon-status.json"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$taskInfo = if ($null -ne $task) { Get-ScheduledTaskInfo -TaskName $taskName } else { $null }
$status = Read-JsonFileIfExists -Path $statusPath

[pscustomobject]@{
  task_name = $taskName
  task_installed = ($null -ne $task)
  task_state = if ($null -ne $task) { $task.State.ToString() } else { $null }
  last_run_time = if ($null -ne $taskInfo) { $taskInfo.LastRunTime.ToString("o") } else { $null }
  next_run_time = if ($null -ne $taskInfo) { $taskInfo.NextRunTime.ToString("o") } else { $null }
  last_task_result = if ($null -ne $taskInfo) { $taskInfo.LastTaskResult } else { $null }
  status_path = $statusPath
  last_status = $status
} | ConvertTo-Json -Depth 20
