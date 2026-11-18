@echo off
setlocal
cd /d "%~dp0"
echo ACADEMIA PIXEL - PREPARAR APK ANDROID
set /p URL=Direccion HTTPS del servidor central (ej. https://juego.tudominio.com): 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\compilar_android_central.ps1" -ServerUrl "%URL%"
if errorlevel 1 echo ERROR. Revisa el mensaje y corrige la configuracion.
pause
