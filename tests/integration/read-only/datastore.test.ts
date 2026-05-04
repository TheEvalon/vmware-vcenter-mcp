import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { firstOf, requireFirstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: datastores', () => {
  it('datastore_list returns at least one datastore', async () => {
    const result = await readOnly.callTool('datastore_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; datastores: unknown[] }>(result);
    expect(sc.count).toBe(sc.datastores.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('datastore_get returns full details for the first datastore', async () => {
    const first = requireFirstOf(inventory.datastores, 'datastores');
    const result = await readOnly.callTool('datastore_get', { datastoreId: first.datastore });
    expectOk(result);
  });

  it('datastore_browse on the root path of the first datastore returns a result envelope', async () => {
    const first = requireFirstOf(inventory.datastores, 'datastores');
    const path = first.name ? `[${first.name}] /` : '[ds] /';
    const result = await readOnly.callTool('datastore_browse', {
      datastoreId: first.datastore,
      path,
    });
    expectOk(result);
    const sc = requireStructured<{ result: unknown }>(result);
    expect(sc).toHaveProperty('result');
  });

  it('datastore_searchRecursive auto-resolves the root and returns a flat file list', async () => {
    const first = firstOf(inventory.datastores);
    if (!first) {
      console.warn('Skipping datastore_searchRecursive: no datastores discovered');
      return;
    }
    const result = await readOnly.callTool('datastore_searchRecursive', {
      datastoreId: first.datastore,
      matchPattern: ['*.iso'],
      caseInsensitive: true,
    });
    expectOk(result);
    const sc = requireStructured<{
      count: number;
      folderCount: number;
      path: string;
      files: unknown[];
    }>(result);
    expect(typeof sc.path).toBe('string');
    expect(sc.path.length).toBeGreaterThan(0);
    expect(sc.count).toBe(sc.files.length);
  });
});
