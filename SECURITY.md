# Security policy

## Reporting a vulnerability

Please report security issues privately to **info@iOblako.com**.

Do **not** open a public GitHub issue or pull request for a suspected
vulnerability.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof-of-concept against a lab vCenter you
  control.
- The MCP server version (`npm pkg get version`) and Node.js version.
- The vCenter Server version and (if relevant) the deployment topology.

**Never include real credentials, real hostnames, real VM names, real
inventory identifiers, or any other sensitive customer data in your
report.** Sanitize logs before sending.

We will acknowledge receipt within 5 business days and aim to provide a
remediation timeline within 14 days. We follow a 90-day coordinated
disclosure window by default, with extensions only when reasonable.

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | yes                |
| < 1.0   | no                 |

## Threat model and operator responsibilities

This MCP server is a **trusted infrastructure tool**. It connects to your
vCenter Server with administrator-class credentials and exposes destructive
operations (power off, delete, vMotion, vLCM remediation, ...). Treat it
accordingly:

- Run it on a host you trust, in a context where MCP-client prompts are
  trusted.
- Prefer `VCENTER_READ_ONLY=true` for any agent loop where write
  authorization has not been explicitly granted.
- Per-tool `confirm: true` is **not** a substitute for a human in the loop
  on production changes; it is an explicit-intent guard, and the dry-run
  preview is the single source of truth for what the next call would do.
- Never set `VCENTER_INSECURE=true` in production. It disables TLS
  verification and is intended only for homelab self-signed certificates.
- Keep `.env` out of version control; the supplied `.gitignore` already
  excludes it.

## Scope

In scope:

- Authentication / session handling (`src/client/session-manager.ts`).
- HTTP transport and TLS handling (`src/client/http-client.ts`,
  `src/client/http-agent.ts`).
- The dry-run / read-only safety layer (`src/tools/_safety.ts`).
- The SOAP escape hatch (`src/tools/soap/index.ts`).
- Logging discipline (no secrets in logs; stdout reserved for JSON-RPC).

Out of scope (please report upstream):

- Vulnerabilities in vCenter Server itself.
- Vulnerabilities in `@modelcontextprotocol/sdk`,
  `@vates/node-vsphere-soap`, `undici`, or other third-party dependencies
  (please report to those projects; we will pick up patched versions
  promptly).
