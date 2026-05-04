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

describe('read-only: ISOs on a datastore', () => {
  it('iso_listFromDatastore returns the search-result envelope for the first datastore', async () => {
    const first = firstOf(inventory.datastores);
    if (!first) {
      console.warn('Skipping iso_listFromDatastore: no datastores in lab');
      return;
    }
    const path = first.name ? `[${first.name}] /` : '[ds] /';
    const result = await readOnly.callTool('iso_listFromDatastore', {
      datastoreId: first.datastore,
      path,
    });
    expectOk(result);
    const sc = requireStructured<{ result: unknown }>(result);
    expect(sc).toHaveProperty('result');
  });
});
