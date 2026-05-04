# Publishing to the official Cursor Marketplace

This is the **deferred** track — applying to the curated
[cursor.com/marketplace](https://cursor.com/marketplace) "Plugins" program.
The community listing on [cursor.directory](https://cursor.directory) is
covered separately by [PUBLISH.md](PUBLISH.md) and is the right starting
point.

The official program is invite/review-based as of May 2026, so this
document is a **readiness checklist**, not a runbook. Tick the boxes,
then submit when an application URL is opened.

---

## Status

| Item                                | Status |
|-------------------------------------|--------|
| Public GitHub repo                  | TODO (see [PUBLISH.md](PUBLISH.md))      |
| MIT license                         | DONE ([LICENSE](LICENSE))                |
| README with quick-start             | DONE ([README.md](README.md))            |
| Branded logo, square, >= 256x256    | DONE ([assets/logo-256.png](assets/logo-256.png)) |
| Branded logo, square, >= 512x512    | DONE ([assets/logo-512.png](assets/logo-512.png)) |
| `.mcp.json` at repo root            | DONE ([.mcp.json](.mcp.json))            |
| Dry-run / kill-switch safety story  | DONE ([README.md#safety--dry-run](README.md#safety--dry-run)) |
| Permission level declared           | DONE: HIGH ([.cursor-directory.md](.cursor-directory.md))         |
| CI green on `main`                  | TODO (after first push)                  |
| Tagged release on GitHub            | TODO ([PUBLISH.md](PUBLISH.md) step 4)   |
| Demo GIF / screenshots              | TODO (see below)                         |
| Maintainer contact                  | DONE: info@iOblako.com                   |
| Security policy                     | DONE ([SECURITY.md](SECURITY.md))        |
| Privacy / data-handling note        | DONE (no telemetry, no data leaves vCenter <-> MCP <-> client) |
| `cursor-plugin.json` manifest       | TODO (shape TBD when applying)           |

## Demo GIF / screenshots (one-time work)

Curated marketplace listings benefit from a 5-15 second visual showing
the MCP being invoked from inside Cursor. Recommended captures:

1. **`vcenter_about` -> `vm_list`** in a Cursor chat. Establishes
   connectivity and basic inventory.
2. **`snapshot_create` without `confirm`** showing the structured
   dry-run preview, then **with `confirm: true`** showing the real task
   completing. Demonstrates the safety model.
3. **`drs_recommendations`** rendered in the chat. Shows DRS visibility
   without writing anything.

Capture options on Windows:

- `ScreenToGif` (free, https://www.screentogif.com/) for animated GIFs.
- `Win + Shift + R` for native screen recording (MP4).

Save outputs to `assets/demo/` (e.g. `assets/demo/dryrun.gif`) and
reference them from the listing description.

## `cursor-plugin.json` skeleton

When the official program publishes a manifest schema, fill out a file
matching that shape. A reasonable starting point based on current
[.cursor-directory.md](.cursor-directory.md) and
[.mcp.json](.mcp.json) content:

```json
{
  "name": "VMware vCenter MCP",
  "slug": "vmware-vcenter-mcp",
  "version": "1.0.0",
  "description": "Manage VMware vCenter 8.0 from Cursor with built-in dry-run safety.",
  "author": {
    "name": "Gregory (iOblako)",
    "email": "info@iOblako.com",
    "url": "https://iOblako.com"
  },
  "repository": "https://github.com/TheEvalon/vmware-vcenter-mcp",
  "homepage": "https://github.com/TheEvalon/vmware-vcenter-mcp#readme",
  "license": "MIT",
  "category": "Infrastructure",
  "tags": [
    "vmware", "vcenter", "vsphere", "virtualization",
    "infrastructure", "devops"
  ],
  "permissions": "high",
  "logo": "assets/logo-512.png",
  "mcp": {
    "$ref": ".mcp.json"
  },
  "safety": [
    "Per-tool dry-run: every destructive tool requires confirm:true.",
    "Global VCENTER_READ_ONLY=true kill switch blocks all writes.",
    "Logs go to stderr only; stdout is reserved for JSON-RPC."
  ]
}
```

Adjust to match the real schema published by Cursor at the time of
application.

## Application notes

- The marketplace homepage is https://cursor.com/marketplace. Look for a
  "Submit a plugin" or "Publish" link, or contact Cursor support to ask
  about the current intake process.
- Reference the live cursor.directory listing in the application — it
  serves as the de-facto stable URL for the MCP.
- Highlight the safety story (dry-run + read-only kill switch). The
  marketplace tilts toward HIGH-permission tools that take safety
  seriously.
- Be ready to demonstrate the MCP works against a real vCenter via a
  short screen recording.

## Privacy / data-handling statement (for the application)

> The VMware vCenter MCP server is a stateless adapter between an
> MCP-compatible client and a vCenter Server you operate. Credentials
> are passed through environment variables, are not persisted to disk,
> and never appear in logs or in the JSON-RPC stream. There is no
> telemetry, no third-party network egress, and no data leaves the
> direct path between your MCP client and your vCenter.

## When something changes

If the schema, application URL, or program rules change, update the
table at the top of this file in the same commit and link the
authoritative Cursor docs. This file is the single internal source of
truth for "what is left before applying".
