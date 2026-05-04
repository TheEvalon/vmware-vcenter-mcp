# Contributing

Thanks for your interest in improving `vmware-vcenter-mcp`. This document
covers local development, the test gates, and conventions for change
proposals.

## Local development

Requirements:

- Node.js >= 22 (a `.nvmrc` is provided; run `nvm use`). Node 20 is not
  supported because `undici@8` requires WHATWG WebIDL helpers that only
  ship in Node 22+.
- A reachable vCenter Server 8.0 only if you intend to run the integration
  suite. Unit tests do not need vCenter.

```powershell
git clone https://github.com/TheEvalon/vmware-vcenter-mcp.git
cd vmware-vcenter-mcp
npm install
copy .env.example .env
# edit .env with your vCenter details
npm run dev    # tsx src/index.ts
```

## Tests

```powershell
npm run typecheck            # src/
npm run typecheck:tests      # tests/
npm test                     # vitest unit suite (no vCenter required)
npm run test:integration:readonly   # full read-only suite against a real vCenter
```

The read-only integration suite is wired into `prepublishOnly`. It boots the
MCP server twice over stdio, exercises every read-only tool, dry-runs every
destructive tool, and verifies the `VCENTER_READ_ONLY=true` kill switch.
Please run it before opening a release PR.

## Coding conventions

- TypeScript strict mode is on; do not introduce `any`.
- Use Zod schemas for any new input/output shape.
- Logs go to stderr only. **Never** call `console.log` (it corrupts the
  JSON-RPC stream).
- Every destructive tool MUST go through `withConfirm()` from
  `src/tools/_safety.ts` so it returns a structured dry-run when `confirm`
  is missing and is also blocked by `VCENTER_READ_ONLY=true`.
- One tool per file inside `src/tools/<domain>/`.
- Naming: `kebab-case` for files and folders, `camelCase` for functions and
  variables, `PascalCase` for types and Zod schemas.

## Commit messages

Please use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(snapshot): add snapshot_revertToCurrent
fix(host): wait for in-progress task before reconnect
docs(readme): document VCENTER_TASK_POLL_MS
```

Keep the title short; put the why in the body.

## Pull requests

- One logical change per PR.
- Update [CHANGELOG.md](CHANGELOG.md) under an `## [Unreleased]` section.
- Update [README.md](README.md) tool catalog if you add or remove a tool.
- The CI workflow runs typecheck and unit tests on every PR. Integration
  tests are not run in CI; please paste output from
  `npm run test:integration:readonly` in the PR description when changing
  client or safety code.

## Security

Please do **not** open public issues for security reports. See
[SECURITY.md](SECURITY.md) for the disclosure process.

## Contact

`info@iOblako.com`
