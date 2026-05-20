@echo off
chcp 65001 >nul
echo ============================================
echo   Mesh — Nettoyage force + push GitHub
echo ============================================
echo.
cd /d "%~dp0"

:: Supprimer le lock git si present
if exist ".git\index.lock" del /f ".git\index.lock" && echo [OK] Lock supprime

echo.
echo [1/5] Suppression des fichiers parasites du suivi git...
git rm --cached -f "$env" 2>nul
git rm --cached -f "LICENSE.txt" 2>nul
git rm --cached -rf ".claude/" 2>nul
git rm --cached -f "mesh-annotate.html" 2>nul
git rm --cached -f "mesh-design-full.html" 2>nul
git rm --cached -f "mesh-design-review.html" 2>nul
git rm --cached -f "mesh-proposals.html" 2>nul
git rm --cached -rf "data/" 2>nul
echo   - Fait

echo.
echo [2/5] Verification — ces fichiers NE doivent plus apparaitre :
git ls-files "$env" ".claude/" "LICENSE.txt" "mesh-annotate.html" "mesh-design-full.html" "mesh-design-review.html" "mesh-proposals.html"
echo   (si vide ci-dessus = parfait)

echo.
echo [3/5] Ajout de tout...
git add -A
echo   - Fait

echo.
echo [4/5] Commit de nettoyage...
git commit -m "chore: retrait fichiers parasites (.claude, $env, LICENSE.txt, html de travail)"
if %errorlevel% neq 0 (
  echo   [INFO] Rien de nouveau a commiter, c'est OK
) else (
  echo   - Commit OK
)

echo.
echo [5/5] Push...
git push
if %errorlevel% neq 0 (
  echo [ERREUR] Push echoue - verifiez votre connexion GitHub
) else (
  echo.
  echo ============================================
  echo   GitHub mis a jour avec succes !
  echo ============================================
)
echo.
pause
