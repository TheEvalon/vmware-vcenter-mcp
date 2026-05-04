import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;

beforeAll(async () => {
  ({ readOnly } = await getFixtures());
});

describe('read-only: tasks', () => {
  it('task_list returns the recent task array', async () => {
    const result = await readOnly.callTool('task_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; tasks: unknown[] }>(result);
    expect(sc.count).toBe(sc.tasks.length);
  });

  it('task_list filtered by VM target type still parses', async () => {
    const result = await readOnly.callTool('task_list', { targetType: 'VirtualMachine' });
    expectOk(result);
  });

  it('task_get on a non-existent task surfaces the vCenter error rather than crashing the server', async () => {
    const result = await readOnly.callTool('task_get', { taskId: 'task-nonexistent-99999' });
    // Either the server returns isError:true (preferred) or the task service
    // happens to return a usable info envelope. Both are acceptable; what's
    // not acceptable is the server failing to respond at all.
    expect(result.content.length).toBeGreaterThan(0);
  });
});
