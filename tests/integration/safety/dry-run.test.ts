import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectDryRun } from '../helpers/assertions.js';
import { DESTRUCTIVE_TOOL_CASES } from '../helpers/destructive-tools.js';
import type { McpFixture } from '../helpers/mcp-client.js';

/**
 * Validates the `withConfirm()` safety wrapper in `src/tools/_safety.ts`:
 * for every destructive tool, calling without `confirm:true` must return a
 * structured dry-run preview instead of touching vCenter.
 *
 * Runs against the writable server (VCENTER_READ_ONLY=false) because the
 * kill-switch short-circuits before the dry-run preview is produced.
 */
let writable: McpFixture;

beforeAll(async () => {
  ({ writable } = await getFixtures());
});

afterAll(() => {
  // No per-suite teardown; fixtures are closed on process exit.
});

describe('safety: destructive tools return a dry-run preview when confirm is omitted', () => {
  for (const tc of DESTRUCTIVE_TOOL_CASES) {
    it(`${tc.name} returns dry-run preview without confirm`, async () => {
      const result = await writable.callTool(tc.name, tc.args);
      expectDryRun(result, tc.name);
      // Sanity-check that no destructive tool's preview accidentally pretends
      // it actually executed. The "DRY RUN:" prefix is the canonical guard.
      const text = result.content[0]?.text ?? '';
      expect(text).not.toMatch(/^Deleted|^Removed |^Power|^Reboot|^Shutdown/i);
    });
  }

  it('covers every destructive tool that the writable server reports as destructiveHint:true', async () => {
    const tools = await writable.client.listTools();
    const declared = new Set(
      tools.tools
        .filter((t) => t.annotations?.destructiveHint === true)
        .map((t) => t.name),
    );
    const tested = new Set(DESTRUCTIVE_TOOL_CASES.map((tc) => tc.name));
    const untested = [...declared].filter((name) => !tested.has(name));
    if (untested.length > 0) {
      throw new Error(
        `Destructive tools declared by the server but missing from DESTRUCTIVE_TOOL_CASES: ${untested.join(', ')}. ` +
          'Add them to tests/integration/helpers/destructive-tools.ts.',
      );
    }
  });
});
