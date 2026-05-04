<!-- Thanks for the contribution. Please fill in the sections below. -->

## Summary

<!-- What does this PR change, and why? Link any related issue. -->

## Type of change

- [ ] Bug fix
- [ ] New tool / feature
- [ ] Refactor (no behavior change)
- [ ] Docs / chore / CI

## Safety checklist

- [ ] No new tool was added without going through `withConfirm()` from
      `src/tools/_safety.ts` (if destructive).
- [ ] No `console.log` calls were added (logs go to stderr only).
- [ ] No real credentials, hostnames, VM IDs, or other lab data appear in
      diffs, tests, or fixtures.
- [ ] `.env` was not committed.

## Test plan

- [ ] `npm run typecheck`
- [ ] `npm run typecheck:tests`
- [ ] `npm test`
- [ ] `npm run test:integration:readonly` (paste a one-line summary below
      if this PR touches `src/client/`, `src/tools/_safety.ts`, or
      `src/index.ts`)

```
# integration summary (optional)
```

## Documentation

- [ ] Updated [README.md](README.md) tool catalog if a tool was added or
      removed.
- [ ] Updated [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]`.
