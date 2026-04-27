@echo off
title Mesh - Compilation .exe
color 0B
echo.
echo  ================================================
echo   Mesh - Compilation en .exe Windows
echo  ================================================
echo.

cd /d "%~dp0"

:: Vérifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js n'est pas installé !
    pause & exit /b 1
)

:: Installer les dépendances si besoin
if not exist "node_modules\" (
    echo  [INFO] Installation des dépendances npm...
    call npm install
)

echo  [1/3] Compilation TypeScript + Vite...
call npm run build
if %errorlevel% neq 0 (
    echo  [ERREUR] La compilation a échoué !
    pause & exit /b 1
)

echo  [2/3] Compilation Electron en .exe Windows...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo  [ERREUR] La compilation Electron a échoué !
    pause & exit /b 1
)

echo.
echo  ================================================
echo   Succès ! Le fichier .exe se trouve dans:
echo   release\
echo  ================================================
echo.

:: Ouvrir le dossier release dans l'explorateur
explorer release

pause
