. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$state = Stop-ResearchSupervisor
Write-ResearchSupervisorStateJson -State $state
