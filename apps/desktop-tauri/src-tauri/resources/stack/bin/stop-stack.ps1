$ErrorActionPreference = "Stop"
$StackDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Push-Location $StackDir
docker compose down
Pop-Location
