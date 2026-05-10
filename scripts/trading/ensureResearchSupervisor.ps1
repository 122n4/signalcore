. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$state = Start-ResearchSupervisor
Write-ResearchSupervisorStateJson -State $state
