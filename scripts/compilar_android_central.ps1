param([Parameter(Mandatory=$true)][string]$ServerUrl)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
try {$uri = [uri]$ServerUrl} catch {throw 'La URL debe ser HTTPS.'}
if ($uri.Scheme -ne 'https' -or !$uri.Host -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) { throw 'Usá una URL HTTPS sin rutas ni parámetros.' }
$origin = $uri.GetLeftPart([System.UriPartial]::Authority)
Write-Host "Comprobando servidor: $origin/api/health" -ForegroundColor Cyan
try {
  $response = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 20
  if (!$response.ok) {throw 'health sin ok'}
} catch {throw "El servidor no está disponible: $($_.Exception.Message)"}
$env:ACADEMIA_SERVER_URL = $origin
Set-Location (Join-Path $root 'android-app')
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {throw 'Falló npm install.'}
if (!(Test-Path 'android')) {
  npm run android:init
} else {
  npm run android:sync
}
if ($LASTEXITCODE -ne 0) {throw 'Falló la preparación de Capacitor.'}
Write-Host 'Abriendo Android Studio. Elegí Build > Generate Signed Bundle / APK > APK.' -ForegroundColor Green
npm run android:studio
if ($LASTEXITCODE -ne 0) {throw 'No se pudo abrir Android Studio.'}
