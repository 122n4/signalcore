. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$state = Start-ResearchSupervisor -ForceRestart:$false
Write-ResearchSupervisorStateJson -State $state
