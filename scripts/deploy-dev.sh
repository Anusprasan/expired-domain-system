#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/200M-Web-App}"
BRANCH="${BRANCH:-dev}"

echo "==> Starting deploy for branch: ${BRANCH}"
echo "==> App directory: ${APP_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed on server."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed on server."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 is not installed on server. Install with: npm i -g pm2"
  exit 1
fi

cd "${APP_DIR}"

echo "==> Updating repository"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> Installing frontend dependencies"
cd "${APP_DIR}/frontend"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Installing backend dependencies"
cd "${APP_DIR}/backend"
npm ci

echo "==> Installing short-link-checker dependencies"
cd "${APP_DIR}/backend/services/short-link-checker-service"
npm ci

echo "==> Installing rank-checker dependencies"
cd "${APP_DIR}/backend/services/rank-checker-service"
npm ci

echo "==> Restarting PM2 services"
cd "${APP_DIR}"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "==> Deploy completed successfully"
