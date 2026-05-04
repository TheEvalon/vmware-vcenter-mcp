import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

const sharesLevel = z.enum(['low', 'normal', 'high', 'custom']);

const allocation = z.object({
  reservation: z.number().nonnegative().optional(),
  expandableReservation: z.boolean().optional(),
  limit: z.number().int().optional(),
  shares: z
    .object({ level: sharesLevel.default('normal'), shares: z.number().int().nonnegative().optional() })
    .optional(),
});

/**
 * Registers tools for managing resource pools.
 */
export const registerResourcePoolTools = (server: McpServer, clients: Clients): void => {
  registerResourcePoolList(server, clients);
  registerResourcePoolCreate(server, clients);
  registerResourcePoolDelete(server, clients);
  registerResourcePoolReconfigure(server, clients);
};

const registerResourcePoolList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'resourcepool_list',
    {
      title: 'List Resource Pools',
      description: 'Lists resource pools via /api/vcenter/resource-pool.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        clusters: z.array(z.string()).optional(),
        hosts: z.array(z.string()).optional(),
        parentResourcePools: z.array(z.string()).optional(),
        datacenters: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), resourcePools: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('resourcepool_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.clusters?.length) query['clusters'] = input.clusters.join(',');
      if (input.hosts?.length) query['hosts'] = input.hosts.join(',');
      if (input.parentResourcePools?.length) query['parent_resource_pools'] = input.parentResourcePools.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      const pools = await clients.rest.get<unknown[]>('/vcenter/resource-pool', { query });
      return ok(`Found ${pools.length} resource pool(s)`, { count: pools.length, resourcePools: pools });
    }),
  );
};

const registerResourcePoolCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'resourcepool_create',
    {
      title: 'Create Resource Pool',
      description: 'Creates a resource pool via POST /api/vcenter/resource-pool.',
      inputSchema: z.object({
        name: z.string().min(1),
        parent: moRefId.describe('Parent resource pool MoRef.'),
        cpuAllocation: allocation.optional(),
        memoryAllocation: allocation.optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ resourcePoolId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'resourcepool_create',
      (input) =>
        buildPreview('resourcepool_create', `Would create resource pool ${input.name} under ${input.parent}`, input),
      async (input) => {
        const body: Record<string, unknown> = { name: input.name, parent: input.parent };
        if (input.cpuAllocation) body['cpu_allocation'] = mapAllocation(input.cpuAllocation);
        if (input.memoryAllocation) body['memory_allocation'] = mapAllocation(input.memoryAllocation);
        const result = await clients.rest.post<string | { value: string }>('/vcenter/resource-pool', body);
        const id = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Created resource pool ${input.name} (${id})`, { resourcePoolId: id });
      },
    ),
  );
};

const registerResourcePoolDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'resourcepool_delete',
    {
      title: 'Delete Resource Pool',
      description: 'Deletes a resource pool via DELETE /api/vcenter/resource-pool/{id}.',
      inputSchema: z.object({ resourcePoolId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ resourcePoolId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'resourcepool_delete',
      (input) =>
        buildPreview('resourcepool_delete', `Would DELETE resource pool ${input.resourcePoolId}`, input),
      async (input) => {
        await clients.rest.del(`/vcenter/resource-pool/${input.resourcePoolId}`);
        return ok(`Deleted resource pool ${input.resourcePoolId}`, { resourcePoolId: input.resourcePoolId });
      },
    ),
  );
};

const registerResourcePoolReconfigure = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'resourcepool_reconfigure',
    {
      title: 'Reconfigure Resource Pool',
      description: 'Updates allocation/share settings on a resource pool via PATCH /api/vcenter/resource-pool/{id}.',
      inputSchema: z.object({
        resourcePoolId: moRefId,
        name: z.string().optional(),
        cpuAllocation: allocation.optional(),
        memoryAllocation: allocation.optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ resourcePoolId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'resourcepool_reconfigure',
      (input) =>
        buildPreview('resourcepool_reconfigure', `Would update resource pool ${input.resourcePoolId}`, input),
      async (input) => {
        const body: Record<string, unknown> = {};
        if (input.name) body['name'] = input.name;
        if (input.cpuAllocation) body['cpu_allocation'] = mapAllocation(input.cpuAllocation);
        if (input.memoryAllocation) body['memory_allocation'] = mapAllocation(input.memoryAllocation);
        await clients.rest.patch(`/vcenter/resource-pool/${input.resourcePoolId}`, body);
        return ok(`Updated resource pool ${input.resourcePoolId}`, { resourcePoolId: input.resourcePoolId });
      },
    ),
  );
};

const mapAllocation = (a: z.infer<typeof allocation>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (a.reservation !== undefined) out['reservation'] = a.reservation;
  if (a.expandableReservation !== undefined) out['expandable_reservation'] = a.expandableReservation;
  if (a.limit !== undefined) out['limit'] = a.limit;
  if (a.shares) {
    out['shares'] = { level: a.shares.level.toUpperCase(), ...(a.shares.shares !== undefined ? { shares: a.shares.shares } : {}) };
  }
  return out;
};
