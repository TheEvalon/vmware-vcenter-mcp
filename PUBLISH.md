# Publish runbook

This file is the ordered checklist for taking the repository from "ready
on disk" to "live on GitHub + listed on cursor.directory". Each step is
intended to be run by you, locally, in this directory.

After the first successful release this file can be archived; subsequent
releases follow steps 4-6 only.

---

## Prerequisites

- `git >= 2.40` on PATH (already verified locally).
- [`gh` (GitHub CLI)](https://cli.github.com/) installed and authenticated.
  Install with `winget install GitHub.cli` on Windows, then run
  `gh auth login` once.
- Push permission on `https://github.com/TheEvalon`.

If `gh` is not available, an HTTPS-only fallback is provided at the end of
each section.

## 0. Sanity checks (already passing as of v1.0.0)

```powershell
npm run typecheck
npm run typecheck:tests
npm test
npm run build
```

All four should be green. The CI workflow runs the first three on every
PR; the build job runs all four.

If you have a vCenter handy, also run:

```powershell
npm run test:integration:readonly
```

## 1. First-time git initialization

Run from the repo root. The `-c` flags set the commit identity for **this
commit only**; they do not write to your global git config.

```powershell
git init --initial-branch=main
git add -A
git -c user.name="TheEvalon" -c user.email="info@iOblako.com" commit -m "chore: initial public release v1.0.0"
```

Expected: a single commit on `main`. Confirm `.env` was NOT staged:

```powershell
git ls-files | Select-String -Pattern '^\.env$'
# (no output expected)
```

## 2. Create the GitHub repository

### Option A: GitHub CLI (preferred)

```powershell
gh repo create TheEvalon/vmware-vcenter-mcp `
  --public `
  --source=. `
  --remote=origin `
  --description "VMware vCenter 8.0 MCP server with dry-run safety" `
  --homepage "https://github.com/TheEvalon/vmware-vcenter-mcp"
```

`gh` will add the `origin` remote automatically.

### Option B: Without `gh`

1. Visit https://github.com/new and create `TheEvalon/vmware-vcenter-mcp`
   as a public, empty repo (no README, no .gitignore, no license -- we
   already have those).
2. Then locally:
   ```powershell
   git remote add origin https://github.com/TheEvalon/vmware-vcenter-mcp.git
   ```

## 3. Push main

```powershell
git push -u origin main
```

## 4. Tag and release v1.0.0

```powershell
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
```

Create the GitHub Release with notes from `CHANGELOG.md`:

```powershell
# Option A: gh
gh release create v1.0.0 --title "v1.0.0" --notes-file CHANGELOG.md
```

```powershell
# Option B: without gh
# Open https://github.com/TheEvalon/vmware-vcenter-mcp/releases/new
# select tag v1.0.0, title "v1.0.0", paste the [1.0.0] section from CHANGELOG.md.
```

## 5. Configure repository topics (optional but improves discoverability)

```powershell
gh repo edit TheEvalon/vmware-vcenter-mcp `
  --add-topic vmware --add-topic vcenter --add-topic vsphere `
  --add-topic mcp --add-topic model-context-protocol `
  --add-topic cursor --add-topic infrastructure --add-topic devops
```

## 6. Submit to cursor.directory (community)

Browser-based, takes about a minute:

1. Open https://cursor.directory/plugins/new and sign in with GitHub.
2. Paste `https://github.com/TheEvalon/vmware-vcenter-mcp` into the
   repository field. The form should auto-detect
   [.mcp.json](.mcp.json).
3. Use the listing copy from [.cursor-directory.md](.cursor-directory.md):
   - **Name:** VMware vCenter MCP
   - **Slug:** `vmware-vcenter-mcp`
   - **Short description / long description / category / tags:** copy
     verbatim.
   - **Permission level:** HIGH (paste the safety paragraph into the
     security-notes field).
   - **Logo:** [assets/logo-256.png](assets/logo-256.png).
4. Submit. Approval is typically the same day.

## 7. (Optional) cursor.com/marketplace official application

This is curated and currently invite/review-based. See
[PUBLISH-CURSOR-OFFICIAL.md](PUBLISH-CURSOR-OFFICIAL.md) for the
checklist of artifacts to assemble and the application notes.

## 8. Post-release

- Verify the GitHub Actions CI badge on the README turns green
  (`https://github.com/TheEvalon/vmware-vcenter-mcp/actions/workflows/ci.yml`).
- Watch GitHub Issues / `info@iOblako.com` for early feedback.
- For the next change, work on a feature branch, open a PR against
  `main`, let CI gate it, and bump the version + CHANGELOG before
  tagging.

---

If anything in this runbook is wrong for your environment, please update
this file in the same PR -- it is the source of truth for releases.
