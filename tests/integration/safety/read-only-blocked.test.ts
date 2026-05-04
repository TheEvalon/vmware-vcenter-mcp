import { beforeAll, describe, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectReadOnlyBlocked } from '../helpers/assertions.js';
import { withConfirmTrue } from '../helpers/destructive-tools.js';
import type { McpFixture } from '../helpers/mcp-client.js';

/**
 * Validates the global `VCENTER_READ_ONLY=true` kill-switch. Even if a caller
 * passes `confirm:true`, every destructive tool MUST refuse with an
 * `isError:true` response that mentions read-only mode.
 *
 * Runs against the read-only server fixture.
 */
let readOnly: McpFixture;

beforeAll(async () => {
  ({ readOnly } = await getFixtures());
});

describe('safety: VCENTER_READ_ONLY=true blocks every destructive tool even with confirm:true', () => {
  for (const tc of withConfirmTrue()) {
    it(`${tc.name} is blocked by the read-only kill switch`, async () => {
      const result = await readOnly.callTool(tc.name, tc.args);
      expectReadOnlyBlocked(result, tc.name);
    });
  }
});
