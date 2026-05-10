. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$state = Get-ResearchSupervisorState
Write-ResearchSupervisorStateJson -State $state
