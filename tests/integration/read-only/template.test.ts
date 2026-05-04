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

describe('read-only: templates and content libraries', () => {
  it('template_list returns an array (possibly empty)', async () => {
    const result = await readOnly.callTool('template_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; templates: unknown[] }>(result);
    expect(sc.count).toBe(sc.templates.length);
  });

  it('contentLibrary_list returns an array (possibly empty)', async () => {
    const result = await readOnly.callTool('contentLibrary_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; libraries: unknown[] }>(result);
    expect(sc.count).toBe(sc.libraries.length);
  });

  it('contentLibraryItem_list parses against the first library (if any)', async () => {
    const lib = firstOf(inventory.contentLibraries) as { id?: string } | undefined;
    if (!lib?.id) {
      console.warn('Skipping contentLibraryItem_list: no content libraries in lab');
      return;
    }
    const result = await readOnly.callTool('contentLibraryItem_list', {
      libraryId: lib.id,
      expand: false,
    });
    expectOk(result);
    const sc = requireStructured<{ count: number; items: unknown[] }>(result);
    expect(sc.count).toBe(sc.items.length);
  });
});
