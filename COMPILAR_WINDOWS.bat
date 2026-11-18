@echo off
setlocal
cd /d "%~dp0"
echo ACADEMIA PIXEL - COMPILAR INSTALADOR WINDOWS
set /p URL=Direccion HTTPS del servidor central (ej. https://juego.tudominio.com): 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\compilar_windows_central.ps1" -ServerUrl "%URL%"
if errorlevel 1 echo ERROR. Revisa el mensaje y corrige la configuracion.
pause
