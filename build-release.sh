#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  Mesh — Script de release
#  Usage : ./build-release.sh [version]
#  Exemple : ./build-release.sh 1.1.0
#
#  Ce script :
#  1. Met à jour la version dans package.json
#  2. Build le frontend + vérifie TypeScript
#  3. Crée un tag git v{version}
#  4. Push le tag → déclenche le workflow GitHub Actions (build Win/Mac/Linux)
# ──────────────────────────────────────────────────────────────────────────────

set -e

VERSION="${1}"

if [ -z "$VERSION" ]; then
  echo "Usage: ./build-release.sh <version>"
  echo "Exemple: ./build-release.sh 1.1.0"
  exit 1
fi

echo "🚀 Préparation de la release Mesh v${VERSION}..."

# 1. Mettre à jour la version dans package.json
npm version "$VERSION" --no-git-tag-version
echo "✓ Version mise à jour : ${VERSION}"

# 2. Vérifier TypeScript
echo "⏳ Vérification TypeScript..."
npm run build
echo "✓ Build OK"

# 3. Commit + tag git
git add package.json package-lock.json
git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}" -m "Mesh v${VERSION}"
echo "✓ Tag créé : v${VERSION}"

# 4. Push
echo "⏳ Push vers GitHub..."
git push origin main
git push origin "v${VERSION}"
echo ""
echo "✅ Release v${VERSION} lancée !"
echo "   Surveille le build sur : https://github.com/mesh-app/mesh/actions"
echo "   La release sera disponible sur : https://github.com/mesh-app/mesh/releases"
