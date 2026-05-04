import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { firstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: customization specs', () => {
  it('customization_list returns an array (possibly empty)', async () => {
    const result = await readOnly.callTool('customization_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; specs: unknown[] }>(result);
    expect(sc.count).toBe(sc.specs.length);
  });

  it('customization_get returns the spec for the first known name (skip if none)', async () => {
    const first = firstOf(inventory.customizationSpecs);
    if (!first?.name) {
      console.warn('Skipping customization_get: no customization specs in lab');
      return;
    }
    const result = await readOnly.callTool('customization_get', { name: first.name });
    expectOk(result);
    const sc = requireStructured<{ spec: unknown }>(result);
    expect(sc.spec).toBeDefined();
  });
});
