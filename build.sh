#!/usr/bin/env bash
# Сборка расширения Claude Desktop (.mcpb) для синтакс-помощника 1С (mcp-bsl-context).
# Запуск: bash build.sh   (из корня репозитория)
# Результат: mcp-bsl-context-desktop-bridge-<версия>.mcpb рядом со скриптом.
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Нужен Node.js 18+ (node не найден)"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || { echo "Нужен Node.js 18+, установлен $(node -v)"; exit 1; }

npm ci --no-audit --no-fund

rm -rf dist && mkdir -p dist/server
npx esbuild src/index.js --bundle --platform=node --target=node18 --format=esm \
  --outfile=dist/server/index.mjs --log-level=warning \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"
cp manifest.json dist/

VERSION=$(node -p 'require("./manifest.json").version')
npx mcpb validate dist/manifest.json
rm -f "mcp-bsl-context-desktop-bridge-$VERSION.mcpb"
npx mcpb pack dist "mcp-bsl-context-desktop-bridge-$VERSION.mcpb"
echo "Готово: mcp-bsl-context-desktop-bridge-$VERSION.mcpb"
