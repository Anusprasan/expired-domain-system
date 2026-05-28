# Commit Message Guide

Commit messages control the automatic version bump in the dev workflow.

## Format

```text
<prefix>: <short description>
```

## Prefixes

| Prefix | Version bump | Example |
| --- | --- | --- |
| `breaking:` | Major | `breaking: new auth flow` |
| `feat:` | Minor | `feat: add payment endpoint` |
| `fix:` | Patch | `fix: resolve login timeout` |
| `chore:` | Patch | `chore: update dependencies` |
| `docs:` | Patch | `docs: update readme` |
| `refactor:` | Patch | `refactor: clean up auth service` |
| `deploy-all:` | Patch for all services | `deploy-all: release all services` |
| No keyword | Patch | `updated readme` |

## Rules

- Dev checks all commit messages in the push range and uses the highest bump found.
- `breaking:` wins over `feat:`, and `feat:` wins over patch.
- `deploy-all:` selects all services, but the bump is still patch unless `feat:` or `breaking:` is also present.
- Keep descriptions short and lowercase.
- `chore(version): bump detected services [skip ci]` is used by the pipeline. Do not create it manually.
- `[skip ci]` in the head commit skips the pipeline completely.

## Examples

```text
feat: add user profile endpoint
fix: correct token expiry calculation
breaking: remove v1 api endpoints
chore: update node version
docs: add api documentation
deploy-all: release all services
```
