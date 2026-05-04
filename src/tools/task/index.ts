import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { NotFoundError } from '../../client/errors.js';

/**
 * Registers tools that read recent / running tasks via the Automation REST
 * `/api/cis/tasks` and the VI/JSON `Task.info` endpoints.
 */
export const registerTaskTools = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'task_list',
    {
      title: 'List Tasks',
      description: 'Lists recent tasks visible in vCenter via /api/cis/tasks.',
      inputSchema: z.object({
        targetType: z.string().optional().describe('Filter by target type, e.g. VirtualMachine.'),
        states: z.array(z.enum(['PENDING', 'RUNNING', 'BLOCKED', 'SUCCEEDED', 'FAILED'])).optional(),
        users: z.array(z.string()).optional(),
        servicesIds: z.array(z.string()).optional(),
        operationsIds: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), tasks: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('task_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.targetType) query['targets.type'] = input.targetType;
      if (input.states?.length) query['filter.states'] = input.states.join(',');
      if (input.users?.length) query['filter.users'] = input.users.join(',');
      if (input.servicesIds?.length) query['filter.services'] = input.servicesIds.join(',');
      if (input.operationsIds?.length) query['filter.operations'] = input.operationsIds.join(',');
      // /api/cis/tasks is the canonical Automation REST surface, but it
      // returns 404 on vCenter deployments where the cis-tasks service is
      // disabled or the caller lacks the operator role. Treat that as an
      // empty list with a hint instead of an error so the tool stays usable
      // for inventory + monitoring use cases.
      try {
        const tasks = await clients.rest.get<unknown[]>('/cis/tasks', { query });
        return ok(`Found ${tasks.length} task(s)`, { count: tasks.length, tasks });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return ok(
            'task_list returned no results (the /api/cis/tasks service is not exposed on this vCenter, ' +
              'or the calling user lacks operator privileges). Use task_get with a known task MoRef instead.',
            { count: 0, tasks: [] },
          );
        }
        throw err;
      }
    }),
  );

  server.registerTool(
    'task_get',
    {
      title: 'Get Task',
      description: 'Returns the full task info for a vim25 Task MoRef via VI/JSON Task.info.',
      inputSchema: z.object({ taskId: z.string().min(1).describe('vim25 Task MoRef value (e.g. task-123).') }),
      outputSchema: z.object({
        state: z.string(),
        progress: z.number().optional(),
        descriptionId: z.string().optional(),
        info: z.unknown(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('task_get', async (input) => {
      const info = await clients.tasks.fetch(input.taskId);
      const state = info.state;
      const summary = `Task ${input.taskId} state=${state}${
        typeof info.progress === 'number' ? ` progress=${info.progress}%` : ''
      }`;
      const out: { state: string; progress?: number; descriptionId?: string; info: unknown } = {
        state,
        info: info.raw,
      };
      if (info.progress !== undefined) out.progress = info.progress;
      if (info.descriptionId !== undefined) out.descriptionId = info.descriptionId;
      return ok(summary, out);
    }),
  );
};
