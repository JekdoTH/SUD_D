# SUD-D

SUD-D is a Windows-first Electron desktop control center for running bounded local development workflows through MCP. It combines workspace-aware coding tools, approval-gated Git operations, a packaged MCP Gateway, and an OpenAI Secure Tunnel integration behind fixed-purpose desktop boundaries.

## Architecture

The desktop renderer talks only to narrow Electron IPC handlers. Privileged behavior stays in the main/application/infrastructure layers, while MCP tools flow through the approved policy and execution boundaries:

```text
Desktop UI
  -> fixed-purpose IPC
  -> application/domain services
  -> infrastructure adapters
  -> MCP Gateway
  -> policy / approval / execution
```

The packaged Windows application includes its MCP Gateway runtime so installed builds do not depend on a source checkout.

## Development

Requirements:

- Windows for desktop packaging and production smoke tests
- Node.js 24 or newer
- pnpm 10.34.5

Install dependencies:

```powershell
pnpm install --frozen-lockfile
```

Useful checks:

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

Windows release packaging is intentionally fail-closed. Release builds require the tracked Ed25519 update public key to be provisioned and passed through `SUD_D_RELEASE_PUBLIC_KEY_FILE`.

## Releases and updates

SUD-D releases use GitHub Releases in this repository. Release tags follow `vX.Y.Z`; the application version is authoritative in `packages/desktop/package.json`.

The release workflow builds the Windows NSIS installer, verifies the packaged revision and MCP tool surface, then signs `sud-d-release.json` with an Ed25519 private key available only to the protected GitHub `release` environment.

v1.0.0 establishes a new update trust root and feed. Existing 0.1.x installations require one manual v1.0.0 installation. After that migration, future supported versions update through **SUD-D Update**.

## Security

Do not commit API keys, tunnel credentials, signing private keys, environment files, or other secrets. See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request expectations.

## License

MIT. See [LICENSE](LICENSE).
