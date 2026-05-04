import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;

beforeAll(async () => {
  ({ readOnly } = await getFixtures());
});

describe('read-only: tags', () => {
  it('category_list (no expand) returns an array of category IDs', async () => {
    const result = await readOnly.callTool('category_list', { expand: false });
    expectOk(result);
    const sc = requireStructured<{ count: number; categories: unknown[] }>(result);
    expect(sc.count).toBe(sc.categories.length);
  });

  it('category_list (expand) returns enriched objects', async () => {
    const result = await readOnly.callTool('category_list', { expand: true });
    expectOk(result);
    const sc = requireStructured<{ count: number; categories: unknown[] }>(result);
    expect(sc.count).toBe(sc.categories.length);
  });

  it('tag_list (no expand) returns an array', async () => {
    const result = await readOnly.callTool('tag_list', { expand: false });
    expectOk(result);
    const sc = requireStructured<{ count: number; tags: unknown[] }>(result);
    expect(sc.count).toBe(sc.tags.length);
  });
});
