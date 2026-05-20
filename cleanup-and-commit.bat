@echo off
chcp 65001 >nul
echo ============================================
echo   Mesh — Nettoyage depot + push GitHub
echo ============================================
echo.

cd /d "%~dp0"

:: Supprimer le lock git si present
if exist ".git\index.lock" (
  del /f ".git\index.lock"
  echo [OK] Lock git supprime
)

echo.
echo [1/6] Retrait des fichiers parasites du suivi git...
git rm --cached "$env" 2>nul && echo   - $env retire || echo   - $env deja absent
git rm --cached "LICENSE.txt" 2>nul && echo   - LICENSE.txt retire || echo   - LICENSE.txt deja absent
git rm --cached ".claude/settings.local.json" 2>nul && echo   - .claude/settings.local.json retire || echo   - deja absent
git rm --cached -r ".claude/" 2>nul && echo   - .claude/ retire || echo   - deja absent
git rm --cached "mesh-annotate.html" 2>nul && echo   - mesh-annotate.html retire || echo   - deja absent
git rm --cached "mesh-design-full.html" 2>nul && echo   - mesh-design-full.html retire || echo   - deja absent
git rm --cached "mesh-design-review.html" 2>nul && echo   - mesh-design-review.html retire || echo   - deja absent
git rm --cached "mesh-proposals.html" 2>nul && echo   - mesh-proposals.html retire || echo   - deja absent
git rm --cached -r "data/" 2>nul && echo   - data/ retire || echo   - deja absent

echo.
echo [2/6] Configuration auteur git (toi uniquement)...
git config user.name "cam83381-arch"
git config user.email "cam83381@gmail.com"
echo   - Auteur : cam83381-arch

echo.
echo [3/6] Ajout de tous les fichiers modifies...
git add -A
echo   - OK

echo.
echo [4/6] Verification de ce qui sera commite...
git status --short
echo.

echo [5/6] Commit...
git commit -m "chore: nettoyage depot + tracker Render + fix emojis, bots, fichiers, membres"
if %errorlevel% neq 0 (
  echo [AVERTISSEMENT] Rien a commiter ou erreur — verifiez ci-dessus
) else (
  echo   - Commit OK
)

echo.
echo [6/6] Push vers GitHub...
git push
if %errorlevel% neq 0 (
  echo.
  echo [ERREUR] Le push a echoue. Verifiez votre connexion ou authentification GitHub.
  echo Vous pouvez reessayer manuellement : git push
) else (
  echo.
  echo ============================================
  echo   Termine ! Depot GitHub mis a jour.
  echo ============================================
)

echo.
pause
