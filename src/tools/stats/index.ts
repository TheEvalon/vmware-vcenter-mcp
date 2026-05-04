import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { moRefId } from '../../schemas/common.js';
import { moRef, unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers performance counter inventory and query tools, both backed by the
 * VI/JSON `PerformanceManager`.
 */
export const registerStatsTools = (server: McpServer, clients: Clients): void => {
  registerStatsCounters(server, clients);
  registerStatsQuery(server, clients);
  registerStatsSummary(server, clients);
};

const getPerfManager = async (clients: Clients): Promise<string> => {
  const content = (await clients.vimjson.get<Record<string, unknown>>('/ServiceInstance/ServiceInstance/content')) ?? {};
  const ref = content['perfManager'] as { value?: string } | undefined;
  if (!ref?.value) throw new Error('PerformanceManager not exposed by vCenter');
  return ref.value;
};

const registerStatsCounters = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'stats_listCounters',
    {
      title: 'List Performance Counters',
      description: 'Lists known performance counters via VI/JSON PerformanceManager.perfCounter.',
      inputSchema: z.object({ groupInfoKeys: z.array(z.string()).optional() }),
      outputSchema: z.object({ count: z.number().int(), counters: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('stats_listCounters', async (input) => {
      const pm = await getPerfManager(clients);
      const counters = await clients.vimjson.get<unknown>(`/PerformanceManager/${pm}/perfCounter`);
      const list = unwrapVimArray<{ groupInfo?: { key?: string } }>(counters);
      const filtered = input.groupInfoKeys?.length
        ? list.filter((c) => {
            const grp = c?.groupInfo?.key;
            return grp ? input.groupInfoKeys?.includes(grp) : false;
          })
        : list;
      return ok(`Returned ${filtered.length} counter(s)`, { count: filtered.length, counters: filtered });
    }),
  );
};

const registerStatsQuery = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'stats_query',
    {
      title: 'Query Performance Stats',
      description:
        'Queries time-series performance data via VI/JSON PerformanceManager.QueryPerf. Supply at least one counterId and the entity ref.',
      inputSchema: z.object({
        entityType: z.string().default('VirtualMachine'),
        entityId: moRefId,
        counterIds: z.array(z.number().int()).min(1),
        instance: z.string().default('').describe('Counter instance, "" for aggregate.'),
        intervalSeconds: z.number().int().positive().default(20),
        maxSamples: z.number().int().positive().max(360).default(15),
        format: z.enum(['normal', 'csv']).default('normal'),
        startTime: z.string().optional().describe('ISO timestamp.'),
        endTime: z.string().optional().describe('ISO timestamp.'),
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('stats_query', async (input) => {
      const pm = await getPerfManager(clients);
      const querySpec: Record<string, unknown> = {
        _typeName: 'PerfQuerySpec',
        entity: moRef(input.entityType, input.entityId),
        metricId: input.counterIds.map((id) => ({
          _typeName: 'PerfMetricId',
          counterId: id,
          instance: input.instance,
        })),
        intervalId: input.intervalSeconds,
        maxSample: input.maxSamples,
        format: input.format,
      };
      if (input.startTime) querySpec['startTime'] = input.startTime;
      if (input.endTime) querySpec['endTime'] = input.endTime;
      const result = await clients.vimjson.post<unknown>(`/PerformanceManager/${pm}/QueryPerf`, {
        querySpec: [querySpec],
      });
      const list = unwrapVimArray(result);
      return ok(`Returned ${list.length} performance series for ${input.entityType}:${input.entityId}`, { result: list });
    }),
  );
};

const registerStatsSummary = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'stats_summary',
    {
      title: 'Performance Summary',
      description:
        'Returns the live PerfProviderSummary for an entity (intervals + refresh rate) via VI/JSON PerformanceManager.QueryPerfProviderSummary.',
      inputSchema: z.object({ entityType: z.string().default('VirtualMachine'), entityId: moRefId }),
      outputSchema: z.object({ summary: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('stats_summary', async (input) => {
      const pm = await getPerfManager(clients);
      const summary = await clients.vimjson.post<unknown>(`/PerformanceManager/${pm}/QueryPerfProviderSummary`, {
        entity: moRef(input.entityType, input.entityId),
      });
      return ok(`PerfProviderSummary for ${input.entityType}:${input.entityId}`, { summary });
    }),
  );
};
