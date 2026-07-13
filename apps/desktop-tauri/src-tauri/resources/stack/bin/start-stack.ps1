$ErrorActionPreference = "Stop"
$StackDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Item -ItemType Directory -Path (Join-Path $StackDir "logs") -Force | Out-Null

Push-Location $StackDir
try {
  docker compose pull api
} catch {
  Write-Warning "Could not pull api image from registry; using local image if present."
}
docker compose up -d
docker compose ps | Out-File -FilePath (Join-Path $StackDir "logs/compose-ps.log")
Pop-Location
