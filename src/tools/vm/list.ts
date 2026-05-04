import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { powerState } from '../../schemas/common.js';

const VmSummary = z.object({
  vm: z.string(),
  name: z.string(),
  power_state: z.string().optional(),
  cpu_count: z.number().int().optional(),
  memory_size_MiB: z.number().int().optional(),
});

/**
 * Registers vm_list which lists virtual machines via the Automation REST API.
 */
export const registerVmList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_list',
    {
      title: 'List Virtual Machines',
      description:
        'Lists VMs known to vCenter, optionally filtered by name, power state, datacenter, host, cluster, folder or resource pool.',
      inputSchema: z.object({
        names: z.array(z.string()).optional().describe('Filter by exact VM names.'),
        powerStates: z.array(powerState).optional().describe('Filter by power state.'),
        datacenters: z.array(z.string()).optional().describe('Filter by datacenter MoRefs.'),
        hosts: z.array(z.string()).optional().describe('Filter by host MoRefs.'),
        clusters: z.array(z.string()).optional().describe('Filter by cluster MoRefs.'),
        folders: z.array(z.string()).optional().describe('Filter by folder MoRefs.'),
        resourcePools: z.array(z.string()).optional().describe('Filter by resource pool MoRefs.'),
      }),
      outputSchema: z.object({ count: z.number().int(), vms: z.array(VmSummary) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('vm_list', async (input) => {
      const query = buildVmListQuery(input);
      const vms = await clients.rest.get<Array<z.infer<typeof VmSummary>>>('/vcenter/vm', { query });
      return ok(`Found ${vms.length} VM(s)`, { count: vms.length, vms });
    }),
  );
};

const buildVmListQuery = (input: {
  names?: string[];
  powerStates?: string[];
  datacenters?: string[];
  hosts?: string[];
  clusters?: string[];
  folders?: string[];
  resourcePools?: string[];
}): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  if (input.names?.length) out['names'] = input.names.join(',');
  if (input.powerStates?.length) out['power_states'] = input.powerStates.join(',');
  if (input.datacenters?.length) out['datacenters'] = input.datacenters.join(',');
  if (input.hosts?.length) out['hosts'] = input.hosts.join(',');
  if (input.clusters?.length) out['clusters'] = input.clusters.join(',');
  if (input.folders?.length) out['folders'] = input.folders.join(',');
  if (input.resourcePools?.length) out['resource_pools'] = input.resourcePools.join(',');
  return out;
};
