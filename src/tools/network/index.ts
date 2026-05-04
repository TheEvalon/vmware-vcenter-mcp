import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers tools for inventorying networks, dvSwitches and creating /
 * removing distributed port groups via VI/JSON.
 */
export const registerNetworkTools = (server: McpServer, clients: Clients): void => {
  registerNetworkList(server, clients);
  registerDvswitchList(server, clients);
  registerDvportgroupList(server, clients);
  registerPortgroupCreate(server, clients);
  registerPortgroupDelete(server, clients);
  registerNetworkAttach(server, clients);
};

const registerNetworkList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'network_list',
    {
      title: 'List Networks',
      description: 'Lists networks (standard + distributed) via /api/vcenter/network.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        types: z.array(z.enum(['STANDARD_PORTGROUP', 'DISTRIBUTED_PORTGROUP', 'OPAQUE_NETWORK'])).optional(),
        datacenters: z.array(z.string()).optional(),
        folders: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), networks: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('network_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.types?.length) query['types'] = input.types.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      if (input.folders?.length) query['folders'] = input.folders.join(',');
      const networks = await clients.rest.get<unknown[]>('/vcenter/network', { query });
      return ok(`Found ${networks.length} network(s)`, { count: networks.length, networks });
    }),
  );
};

const registerDvswitchList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'dvswitch_list',
    {
      title: 'List Distributed Switches',
      description: 'Lists distributed virtual switches via VI/JSON Folder.childEntity (network folder).',
      inputSchema: z.object({ datacenterId: moRefId.optional() }),
      outputSchema: z.object({ count: z.number().int(), switches: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('dvswitch_list', async (input) => {
      const datacenterId = input.datacenterId;
      if (!datacenterId) {
        return ok(
          'Provide datacenterId to enumerate dvSwitches via that datacenter\'s network folder.',
          { count: 0, switches: [] },
        );
      }
      // Fetch only the networkFolder property. Fetching the full Datacenter
      // managed object via VI/JSON GET-all returns 500 on some 8.0 patch
      // levels because not every property is JSON-serializable.
      const networkFolderRef = await clients.vimjson
        .get<unknown>(`/Datacenter/${datacenterId}/networkFolder`)
        .catch(() => undefined);
      const networkFolder = extractMoRefValue(networkFolderRef);
      if (!networkFolder) {
        return ok('Datacenter has no networkFolder.', { count: 0, switches: [] });
      }
      const childEntity = await clients.vimjson.get<unknown>(`/Folder/${networkFolder}/childEntity`);
      const list = unwrapVimArray<{ type?: string }>(childEntity);
      const switches = list.filter(
        (entry) => entry?.type === 'VmwareDistributedVirtualSwitch' || entry?.type === 'DistributedVirtualSwitch',
      );
      return ok(`Found ${switches.length} dvSwitch(es)`, { count: switches.length, switches });
    }),
  );
};

const registerDvportgroupList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'dvportgroup_list',
    {
      title: 'List Distributed Port Groups',
      description: 'Lists distributed port groups belonging to a dvSwitch via VI/JSON.',
      inputSchema: z.object({ dvswitchId: moRefId }),
      outputSchema: z.object({ count: z.number().int(), portgroups: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('dvportgroup_list', async (input) => {
      const portgroups = await clients.vimjson.get<unknown>(
        `/VmwareDistributedVirtualSwitch/${input.dvswitchId}/portgroup`,
      );
      const list = unwrapVimArray(portgroups);
      return ok(`Found ${list.length} dvPortGroup(s)`, { count: list.length, portgroups: list });
    }),
  );
};

const registerPortgroupCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'portgroup_create',
    {
      title: 'Create Distributed Port Group',
      description: 'Creates a dvPortGroup on a dvSwitch via VI/JSON DistributedVirtualSwitch.AddDVPortgroup_Task.',
      inputSchema: z.object({
        dvswitchId: moRefId,
        name: z.string().min(1),
        vlanId: z.number().int().min(0).max(4094).optional(),
        numPorts: z.number().int().positive().default(8),
        type: z.enum(['earlyBinding', 'lateBinding', 'ephemeral']).default('earlyBinding'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'portgroup_create',
      (input) =>
        buildPreview('portgroup_create', `Would create dvPortGroup ${input.name} on ${input.dvswitchId}`, input),
      async (input) => {
        const spec: Record<string, unknown> = {
          _typeName: 'DVPortgroupConfigSpec',
          name: input.name,
          numPorts: input.numPorts,
          type: input.type,
        };
        if (input.vlanId !== undefined) {
          spec['defaultPortConfig'] = {
            _typeName: 'VMwareDVSPortSetting',
            vlan: { _typeName: 'VmwareDistributedVirtualSwitchVlanIdSpec', vlanId: input.vlanId, inherited: false },
          };
        }
        const task = await clients.vimjson.postTask(
          `/VmwareDistributedVirtualSwitch/${input.dvswitchId}/AddDVPortgroup_Task`,
          { spec: [spec] },
        );
        await clients.tasks.waitFor(task.value);
        return ok(`Created dvPortGroup ${input.name}`, { taskId: task.value });
      },
    ),
  );
};

const registerPortgroupDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'portgroup_delete',
    {
      title: 'Delete Distributed Port Group',
      description: 'Deletes a dvPortGroup via VI/JSON DistributedVirtualPortgroup.Destroy_Task.',
      inputSchema: z.object({ portgroupId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'portgroup_delete',
      (input) =>
        buildPreview('portgroup_delete', `Would DELETE dvPortGroup ${input.portgroupId}`, input),
      async (input) => {
        const task = await clients.vimjson.postTask(
          `/DistributedVirtualPortgroup/${input.portgroupId}/Destroy_Task`,
          {},
        );
        await clients.tasks.waitFor(task.value);
        return ok(`Deleted dvPortGroup ${input.portgroupId}`, { taskId: task.value });
      },
    ),
  );
};

const registerNetworkAttach = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_attachNetwork',
    {
      title: 'Attach VM NIC',
      description: 'Adds a new NIC to a VM via POST /api/vcenter/vm/{id}/hardware/ethernet.',
      inputSchema: z.object({
        vmId: moRefId,
        network: z.string().describe('Network MoRef'),
        type: z.enum(['VMXNET3', 'E1000', 'E1000E', 'PCNET32', 'SRIOV']).default('VMXNET3'),
        startConnected: z.boolean().default(true),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ nic: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_attachNetwork',
      (input) => buildPreview('vm_attachNetwork', `Would attach NIC on ${input.vmId} to ${input.network}`, input),
      async (input) => {
        const result = await clients.rest.post<string | { value: string }>(
          `/vcenter/vm/${input.vmId}/hardware/ethernet`,
          {
            type: input.type,
            backing: { type: 'STANDARD_PORTGROUP', network: input.network },
            start_connected: input.startConnected,
          },
        );
        const nic = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Attached NIC ${nic} on ${input.vmId}`, { nic });
      },
    ),
  );
};

/**
 * Pulls the `value` field out of a VI/JSON ManagedObjectReference response.
 * Handles all three shapes vCenter returns: a bare string MoRef, a
 * `{ value: 'group-n123' }` object, or a fully-typed
 * `{ _typeName: 'ManagedObjectReference', type, value }`.
 */
const extractMoRefValue = (raw: unknown): string | undefined => {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r['value'] === 'string') return r['value'] as string;
  }
  return undefined;
};
