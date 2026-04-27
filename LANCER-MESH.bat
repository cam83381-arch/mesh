@echo off
title Mesh - Lancement
color 0A
cd /d "%~dp0"

if "%1"=="dev" goto DEV

echo Demarrage de Mesh (production)...
set NODE_ENV=production
start "" node server/index.js
timeout /t 1 /nobreak >nul
npx electron electron/main.js
goto END

:DEV
echo Demarrage de Mesh (dev)...
npm run dev:all

:END
