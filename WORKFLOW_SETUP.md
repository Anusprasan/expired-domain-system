# Microservices Workflow Setup Guide

## Overview

The CI/CD workflows use per-service semantic versions and build images directly for each environment.

- Only changed services are built and deployed.
- `deploy-all:` in a commit message selects every service.
- Only the dev workflow bumps service versions.
- QA, staging, and prod read the existing service version from each service `package.json`.
- Image names stay unchanged: `ghcr.io/<owner>/<environment>/<service>:<version>` plus `:latest`.

## Workflow Files

- `.github/service-catalog.json`: Single source of truth for service names, directories, package files, Dockerfiles, and SSH secret names.
- `.github/workflows/reusable-detect.yml`: Detects changed services across the full push range and computes the highest version bump.
- `.github/workflows/deploy-dev.yml`: Bumps changed service versions, builds dev images, and deploys dev.
- `.github/workflows/reusable-build-deploy-env.yml`: Builds QA, staging, or prod images with existing service versions, then deploys them.
- `.github/workflows/deploy-qa.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml`: Thin environment wrappers.
- `.github/workflows/repair-dev-images.yml`: Manual workflow to rebuild missing dev images for selected services.

## Services

Change detection is driven by `.github/service-catalog.json`.

| Service | Package version source | Image shape |
| --- | --- | --- |
| `frontend` | `frontend/package.json` | `ghcr.io/<owner>/<environment>/frontend:<version>` |
| `backend` | `backend/package.json` | `ghcr.io/<owner>/<environment>/backend:<version>` |
| `rank-checker-service` | `backend/services/rank-checker-service/package.json` | `ghcr.io/<owner>/<environment>/rank-checker-service:<version>` |
| `screenshot-taker-service` | `backend/services/screenshot-taker-service/package.json` | `ghcr.io/<owner>/<environment>/screenshot-taker-service:<version>` |
| `short-link-checker-service` | `backend/services/short-link-checker-service/package.json` | `ghcr.io/<owner>/<environment>/short-link-checker-service:<version>` |

`backend/services/*` changes are treated as standalone service changes, not as a `backend` service change.

## Version Bumping

Dev uses all commit messages in the push range and applies the highest bump found:

| Commit keyword | Bump type | Example |
| --- | --- | --- |
| `breaking:` | Major | `1.0.0 -> 2.0.0` |
| `feat:` | Minor | `1.0.0 -> 1.1.0` |
| Anything else | Patch | `1.0.0 -> 1.0.1` |
| `deploy-all:` | Selects all services | Patch unless `feat:` or `breaking:` is also present |

The version bump commit is created by GitHub Actions as:

```text
chore(version): bump detected services [skip ci]
```

Do not create that commit manually.

## Environment Build Flow

When dev is merged into QA, staging, or prod:

1. The target environment workflow detects changed services from the push range.
2. It reads each selected service version from that service's `package.json`.
3. It builds and pushes `ghcr.io/<owner>/<environment>/<service>:<version>`.
4. It also updates `ghcr.io/<owner>/<environment>/<service>:latest`.
5. It deploys the service with `SERVICE_NAME VERSION ENVIRONMENT`.

`latest` is only a convenience tag. The real release identity is always the service's `1.x.x` tag.

## Deploy Script Contract

All environments call the same deploy script shape:

```bash
bash /var/www/deploy-script-200m.sh SERVICE_NAME VERSION ENVIRONMENT
```

Parameters:

- `$1`: service name, for example `frontend` or `rank-checker-service`
- `$2`: exact semantic version, for example `1.0.5`
- `$3`: environment, one of `dev`, `qa`, `staging`, or `prod`

The script should pull:

```bash
docker pull ghcr.io/<owner>/$ENVIRONMENT/$SERVICE_NAME:$VERSION
```

## Required Secrets

Set these secrets for each GitHub environment (`dev`, `qa`, `staging`, `prod`) so the same catalog works everywhere:

- `SSH_HOST_FRONTEND`, `SSH_USER_FRONTEND`, `SSH_KEY_FRONTEND`
- `SSH_HOST_BACKEND`, `SSH_USER_BACKEND`, `SSH_KEY_BACKEND`
- `SSH_HOST_RANK_CHECKER`, `SSH_USER_RANK_CHECKER`, `SSH_KEY_RANK_CHECKER`
- `SSH_HOST_SCREENSHOT`, `SSH_USER_SCREENSHOT`, `SSH_KEY_SCREENSHOT`
- `SSH_HOST_SHORT_LINK`, `SSH_USER_SHORT_LINK`, `SSH_KEY_SHORT_LINK`
- `GHCR_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_BOT_TOKEN`
- `SNYK_TOKEN` for dev scanning

## Repair Dev Images

Use `Repair Dev Images` manually when a dev image tag needs to be rebuilt.

Inputs:

- `ref`: branch or commit to build from, usually the branch that contains the required package version.
- `services`: `all` or a comma-separated list such as `backend,rank-checker-service`.

The repair workflow does not bump versions or deploy. It only rebuilds `ghcr.io/<owner>/dev/<service>:<package.json version>` and `:latest`.
