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

describe('read-only: identity / RBAC', () => {
  it('role_list returns the canonical vCenter role catalog', async () => {
    const result = await readOnly.callTool('role_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; roles: unknown[] }>(result);
    expect(sc.count).toBe(sc.roles.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('permission_list parses against the first known datacenter', async () => {
    const dc = firstOf(inventory.datacenters);
    if (!dc) {
      console.warn('Skipping permission_list: no datacenters discovered');
      return;
    }
    const result = await readOnly.callTool('permission_list', {
      entityType: 'Datacenter',
      entityId: dc.datacenter,
      inherited: false,
    });
    expectOk(result);
    const sc = requireStructured<{ count: number; permissions: unknown[] }>(result);
    expect(sc.count).toBe(sc.permissions.length);
  });

  it('identityProvider_list returns an array (possibly empty)', async () => {
    const result = await readOnly.callTool('identityProvider_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; providers: unknown[] }>(result);
    expect(sc.count).toBe(sc.providers.length);
  });
});
