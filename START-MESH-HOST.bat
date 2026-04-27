@echo off
title Mesh - Lancement du serveur
color 0A

echo ============================================
echo   MESH - Lancement du serveur + ngrok
echo ============================================
echo.

:: Verifier que Node est installe
node --version >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe.
  echo Telecharge-le sur https://nodejs.org
  pause
  exit /b 1
)

:: Aller dans le dossier du script
cd /d "%~dp0"

:: Installer les dependances si necessaire
if not exist "node_modules" (
  echo [INFO] Installation des dependances...
  npm install
)

echo.
echo [1/2] Demarrage du serveur Mesh sur le port 3001...
start "Mesh Server" cmd /k "node server/server.js"

:: Attendre que le serveur demarre
timeout /t 2 /nobreak >nul

echo [2/2] Ouverture du tunnel ngrok...
echo.

:: Verifier si ngrok est disponible
ngrok --version >nul 2>&1
if errorlevel 1 (
  echo [ATTENTION] ngrok n'est pas installe ou pas dans le PATH.
  echo.
  echo Pour installer ngrok :
  echo   1. Va sur https://ngrok.com/download
  echo   2. Cree un compte gratuit
  echo   3. Telecharge ngrok.exe et place-le dans ce dossier ou dans C:\Windows\System32
  echo   4. Lance : ngrok config add-authtoken TON_TOKEN
  echo   5. Relance ce script
  echo.
  echo En attendant, le serveur local tourne sur http://localhost:3001
  echo Tes amis ne peuvent pas s'y connecter depuis Internet.
  pause
  exit /b 0
)

echo ============================================
echo  ngrok va s'ouvrir. Copie l'URL "Forwarding"
echo  (ex: https://xxxx-xx-xx.ngrok-free.app)
echo  et envoie-la a tes amis !
echo ============================================
echo.

ngrok http 3001
