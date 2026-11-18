param([Parameter(Mandatory=$true)][string]$ServerUrl)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
try {$uri = [uri]$ServerUrl} catch {throw 'La URL debe ser HTTPS, por ejemplo https://juego.tudominio.com'}
if ($uri.Scheme -ne 'https' -or !$uri.Host -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
  throw 'Usá únicamente el origen HTTPS, sin /api, usuario, contraseña ni parámetros.'
}
$origin = $uri.GetLeftPart([System.UriPartial]::Authority)
$health = "$origin/api/health"
Write-Host "Comprobando servidor central: $health" -ForegroundColor Cyan
try {
  $response = Invoke-RestMethod -Uri $health -Method Get -TimeoutSec 20
  if (!$response.ok) {throw 'health no devolvió ok'}
} catch {throw "El servidor no está accesible por HTTPS: $health. $($_.Exception.Message)"}
$config = @{ serverUrl = $origin } | ConvertTo-Json
Set-Content -Path (Join-Path $root 'desktop/server-config.json') -Value $config -Encoding UTF8
Set-Location (Join-Path $root 'desktop')
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {throw 'Falló npm install.'}
npm run dist:win
if ($LASTEXITCODE -ne 0) {throw 'Falló electron-builder.'}
Write-Host "Instalador generado: $root\dist-windows\AcademiaPixel-Setup.exe" -ForegroundColor Green
