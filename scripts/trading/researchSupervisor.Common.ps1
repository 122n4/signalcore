Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ResearchRepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-ResearchPaths {
  $repoRoot = Get-ResearchRepoRoot
  $runtimeDir = Join-Path $repoRoot "artifacts\trading-research\runtime"
  $queueDir = Join-Path $repoRoot "artifacts\trading-research\queue"

  [pscustomobject]@{
    RepoRoot = $repoRoot
    RuntimeDir = $runtimeDir
    QueueDir = $queueDir
    ConfigPath = Join-Path $repoRoot "config\trading-research\research-config.json"
    QueuePath = Join-Path $queueDir "research-queue.json"
    LockPath = Join-Path $queueDir "research-lock.json"
    LaunchPath = Join-Path $runtimeDir "research-supervisor.launch.json"
    MetaPath = Join-Path $runtimeDir "research-supervisor.meta.json"
    StdoutPath = Join-Path $runtimeDir "research-supervisor.stdout.log"
    StderrPath = Join-Path $runtimeDir "research-supervisor.stderr.log"
    EnsureScriptPath = Join-Path $repoRoot "scripts\trading\ensureResearchSupervisor.ps1"
  }
}

function Read-JsonFileIfExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = Get-Content $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Get-ResearchLockHealth {
  param(
    [Parameter(Mandatory = $true)]
    $Lock,
    [Parameter(Mandatory = $true)]
    $Config
  )

  $heartbeatMs = ([DateTimeOffset]::Parse($Lock.heartbeat_at)).ToUnixTimeMilliseconds()
  $nowMs = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $ageMs = $nowMs - $heartbeatMs

  if ($ageMs -gt [int64]$Config.timing.hungLockMs) {
    return "hung"
  }
  if ($ageMs -gt [int64]$Config.timing.staleLockMs) {
    return "stale"
  }
  return "healthy"
}

function Get-ProcessIfRunning {
  param(
    [Parameter(Mandatory = $false)]
    [Nullable[int]]$Id
  )

  if ($null -eq $Id) {
    return $null
  }

  return Get-Process -Id $Id -ErrorAction SilentlyContinue
}

function Get-ResearchSupervisorState {
  $paths = Get-ResearchPaths
  $config = Read-JsonFileIfExists -Path $paths.ConfigPath
  $queue = Read-JsonFileIfExists -Path $paths.QueuePath
  $lock = Read-JsonFileIfExists -Path $paths.LockPath
  $launch = Read-JsonFileIfExists -Path $paths.LaunchPath
  $meta = Read-JsonFileIfExists -Path $paths.MetaPath

  $supervisorPid = $null
  if ($null -ne $launch -and $null -ne $launch.supervisor_pid) {
    $supervisorPid = [int]$launch.supervisor_pid
  } elseif ($null -ne $meta -and $null -ne $meta.supervisor_pid) {
    $supervisorPid = [int]$meta.supervisor_pid
  }

  $workerPid = $null
  if ($null -ne $meta -and $null -ne $meta.worker_pid) {
    $workerPid = [int]$meta.worker_pid
  }

  $supervisorProcess = Get-ProcessIfRunning -Id $supervisorPid
  $workerProcess = Get-ProcessIfRunning -Id $workerPid

  $lockHealth = $null
  if ($null -ne $lock -and $null -ne $config) {
    $lockHealth = Get-ResearchLockHealth -Lock $lock -Config $config
  }

  [pscustomobject]@{
    Paths = $paths
    Config = $config
    Queue = $queue
    Lock = $lock
    LockHealth = $lockHealth
    Launch = $launch
    Meta = $meta
    SupervisorPid = $supervisorPid
    WorkerPid = $workerPid
    SupervisorRunning = ($null -ne $supervisorProcess)
    WorkerRunning = ($null -ne $workerProcess)
    ActiveRunId = if ($null -ne $queue) { $queue.active_run_id } else { $null }
    IdleReason = if ($null -ne $queue) { $queue.idle_reason } else { $null }
  }
}

function Stop-ResearchSupervisor {
  $state = Get-ResearchSupervisorState

  if ($state.WorkerRunning -and $null -ne $state.WorkerPid) {
    Stop-Process -Id $state.WorkerPid -Force -ErrorAction SilentlyContinue
  }
  if ($state.SupervisorRunning -and $null -ne $state.SupervisorPid) {
    Stop-Process -Id $state.SupervisorPid -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 2
  return Get-ResearchSupervisorState
}

function Start-ResearchSupervisor {
  param(
    [switch]$ForceRestart
  )

  $state = Get-ResearchSupervisorState

  $mustRestart =
    $ForceRestart.IsPresent -or
    (-not $state.SupervisorRunning) -or
    ($state.LockHealth -eq "stale") -or
    ($state.LockHealth -eq "hung")

  if (-not $mustRestart) {
    return $state
  }

  if ($state.SupervisorRunning -or $state.WorkerRunning) {
    $null = Stop-ResearchSupervisor
  }

  $paths = Get-ResearchPaths
  New-Item -ItemType Directory -Path $paths.RuntimeDir -Force | Out-Null

  $nodePath = (Get-Command node).Source
  $arguments = @(
    "-r",
    "./scripts/register-alias.cjs",
    "./node_modules/jiti/bin/jiti.js",
    "scripts/trading/runResearchSupervisor.ts"
  )

  $process = Start-Process -FilePath $nodePath `
    -ArgumentList $arguments `
    -WorkingDirectory $paths.RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $paths.StdoutPath `
    -RedirectStandardError $paths.StderrPath `
    -PassThru

  $launch = [pscustomobject]@{
    launched_at = (Get-Date).ToString("o")
    launcher_pid = $PID
    supervisor_pid = $process.Id
    command = "node -r ./scripts/register-alias.cjs ./node_modules/jiti/bin/jiti.js scripts/trading/runResearchSupervisor.ts"
    stdout = $paths.StdoutPath
    stderr = $paths.StderrPath
  }
  $launch | ConvertTo-Json -Depth 5 | Set-Content $paths.LaunchPath

  Start-Sleep -Seconds 3
  return Get-ResearchSupervisorState
}

function Write-ResearchSupervisorStateJson {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  $payload = [pscustomobject]@{
    supervisor_pid = $State.SupervisorPid
    worker_pid = $State.WorkerPid
    supervisor_running = $State.SupervisorRunning
    worker_running = $State.WorkerRunning
    active_run_id = $State.ActiveRunId
    idle_reason = $State.IdleReason
    lock_health = $State.LockHealth
    lock_heartbeat_at = if ($null -ne $State.Lock) { $State.Lock.heartbeat_at } else { $null }
    launched_at = if ($null -ne $State.Launch) { $State.Launch.launched_at } else { $null }
  }

  $payload | ConvertTo-Json -Depth 5
}
