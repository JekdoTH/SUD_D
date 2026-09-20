# Contributing to SUD-D

## Development setup

Use Node.js 24 or newer and pnpm 10.34.5.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
```

Use focused tests for the area you change. Run broader checks when the change crosses security, data, packaging, or shared architecture boundaries.

## Branches and pull requests

Create a focused branch from the current integration branch, keep commits narrow, and avoid unrelated refactors. Pull requests should explain the user-visible or technical intent, the security impact where relevant, and the verification performed.

Do not commit local runtime state, generated release artifacts, credentials, API keys, environment files, signing keys, or private user data.

## Tests

Changes should include or update focused regression coverage when behavior changes. Packaging and updater changes must preserve fail-closed verification, explicit user-controlled installation, and the fixed-purpose privileged boundaries.

## Releases

Release version changes, signing-key rotation, release tags, GitHub Releases, and publication workflows are maintainer-only operations. Contributors must not add release credentials or private signing material to source, fixtures, logs, or pull requests.
