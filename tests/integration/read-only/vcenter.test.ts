import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;

beforeAll(async () => {
  ({ readOnly } = await getFixtures());
});

describe('read-only: vcenter introspection', () => {
  it('vcenter_about returns version + apiVersion strings', async () => {
    const result = await readOnly.callTool('vcenter_about', {});
    expectOk(result);
    const sc = requireStructured<{
      version?: string;
      apiVersion?: string;
      build?: string;
      raw: unknown;
    }>(result);
    expect(typeof sc.apiVersion === 'string' && sc.apiVersion.length > 0).toBe(true);
  });

  it('vcenter_health returns at least the system component', async () => {
    const result = await readOnly.callTool('vcenter_health', {});
    expectOk(result);
    const sc = requireStructured<{ system: string; components?: Record<string, string> }>(result);
    expect(typeof sc.system).toBe('string');
    expect(sc.system.length).toBeGreaterThan(0);
  });
});
