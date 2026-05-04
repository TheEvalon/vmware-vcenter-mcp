import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers all cluster + DRS + HA tools.
 *
 * Cluster create/delete and DRS/HA reconfiguration go through VI/JSON because
 * the Automation REST API only exposes read endpoints for clusters.
 */
export const registerClusterTools = (server: McpServer, clients: Clients): void => {
  registerClusterList(server, clients);
  registerClusterGet(server, clients);
  registerClusterCreate(server, clients);
  registerClusterDelete(server, clients);
  registerClusterSetDrs(server, clients);
  registerClusterSetHa(server, clients);
  registerDrsRecommendations(server, clients);
  registerDrsApply(server, clients);
};

const registerClusterList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'cluster_list',
    {
      title: 'List Clusters',
      description: 'Lists clusters via /api/vcenter/cluster.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        datacenters: z.array(z.string()).optional(),
        folders: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), clusters: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('cluster_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      if (input.folders?.length) query['folders'] = input.folders.join(',');
      const clusters = await clients.rest.get<unknown[]>('/vcenter/cluster', { query });
      return ok(`Found ${clusters.length} cluster(s)`, { count: clusters.length, clusters });
    }),
  );
};

const registerClusterGet = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'cluster_get',
    {
      title: 'Get Cluster',
      description: 'Returns detailed cluster info via /api/vcenter/cluster/{id} plus DRS/HA settings via VI/JSON.',
      inputSchema: z.object({ clusterId: moRefId }),
      outputSchema: z.object({ cluster: z.unknown(), configuration: z.unknown().optional() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('cluster_get', async (input) => {
      const cluster = await clients.rest.get<unknown>(`/vcenter/cluster/${input.clusterId}`);
      const configuration = await clients.vimjson
        .get<unknown>(`/ClusterComputeResource/${input.clusterId}/configurationEx`)
        .catch(() => undefined);
      return ok(`Cluster ${input.clusterId}`, { cluster, configuration });
    }),
  );
};

const registerClusterCreate = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    name: z.string().min(1),
    parentFolder: moRefId.describe('Host folder MoRef under a datacenter (folder.host).'),
    drsEnabled: z.boolean().default(true),
    haEnabled: z.boolean().default(true),
    confirm: confirmFlag,
  });
  server.registerTool(
    'cluster_create',
    {
      title: 'Create Cluster',
      description:
        'Creates a new compute cluster via VI/JSON Folder.CreateClusterEx (host folder of a datacenter).',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ clusterId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'cluster_create',
      (input) =>
        buildPreview('cluster_create', `Would create cluster ${input.name} under ${input.parentFolder}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/Folder/${input.parentFolder}/CreateClusterEx`,
        }),
      async (input) => {
        const result = await clients.vimjson.post<{ value?: string; type?: string }>(
          `/Folder/${input.parentFolder}/CreateClusterEx`,
          {
            name: input.name,
            spec: {
              _typeName: 'ClusterConfigSpecEx',
              dasConfig: { _typeName: 'ClusterDasConfigInfo', enabled: input.haEnabled },
              drsConfig: { _typeName: 'ClusterDrsConfigInfo', enabled: input.drsEnabled },
            },
          },
        );
        const clusterId = result?.value ?? '';
        return ok(`Created cluster ${input.name} (${clusterId})`, { clusterId });
      },
    ),
  );
};

const registerClusterDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'cluster_delete',
    {
      title: 'Delete Cluster',
      description:
        'Deletes a cluster via VI/JSON ClusterComputeResource.Destroy_Task. The cluster must be empty first.',
      inputSchema: z.object({ clusterId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'cluster_delete',
      (input) =>
        buildPreview('cluster_delete', `Would DELETE cluster ${input.clusterId}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/ClusterComputeResource/${input.clusterId}/Destroy_Task`,
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/ClusterComputeResource/${input.clusterId}/Destroy_Task`, {});
        await clients.tasks.waitFor(task.value);
        return ok(`Deleted cluster ${input.clusterId}`, { taskId: task.value });
      },
    ),
  );
};

const registerClusterSetDrs = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'cluster_setDrs',
    {
      title: 'Configure DRS',
      description:
        'Enables/disables DRS and tunes its automation level via VI/JSON ClusterComputeResource.ReconfigureComputeResource_Task.',
      inputSchema: z.object({
        clusterId: moRefId,
        enabled: z.boolean(),
        defaultVmBehavior: z.enum(['fullyAutomated', 'partiallyAutomated', 'manual']).optional(),
        vmotionRate: z.number().int().min(1).max(5).optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'cluster_setDrs',
      (input) =>
        buildPreview('cluster_setDrs', `Would set DRS on ${input.clusterId} -> enabled=${input.enabled}`, input),
      async (input) => {
        const drsConfig: Record<string, unknown> = { _typeName: 'ClusterDrsConfigInfo', enabled: input.enabled };
        if (input.defaultVmBehavior) drsConfig['defaultVmBehavior'] = input.defaultVmBehavior;
        if (input.vmotionRate !== undefined) drsConfig['vmotionRate'] = input.vmotionRate;
        const task = await clients.vimjson.postTask(
          `/ClusterComputeResource/${input.clusterId}/ReconfigureComputeResource_Task`,
          { spec: { _typeName: 'ClusterConfigSpecEx', drsConfig }, modify: true },
        );
        await clients.tasks.waitFor(task.value);
        return ok(`DRS reconfigured on ${input.clusterId}`, { taskId: task.value });
      },
    ),
  );
};

const registerClusterSetHa = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'cluster_setHa',
    {
      title: 'Configure HA',
      description:
        'Enables/disables HA and admission control via VI/JSON ClusterComputeResource.ReconfigureComputeResource_Task.',
      inputSchema: z.object({
        clusterId: moRefId,
        enabled: z.boolean(),
        admissionControlEnabled: z.boolean().optional(),
        hostMonitoring: z.enum(['enabled', 'disabled']).optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'cluster_setHa',
      (input) =>
        buildPreview('cluster_setHa', `Would set HA on ${input.clusterId} -> enabled=${input.enabled}`, input),
      async (input) => {
        const dasConfig: Record<string, unknown> = { _typeName: 'ClusterDasConfigInfo', enabled: input.enabled };
        if (input.admissionControlEnabled !== undefined) dasConfig['admissionControlEnabled'] = input.admissionControlEnabled;
        if (input.hostMonitoring) dasConfig['hostMonitoring'] = input.hostMonitoring;
        const task = await clients.vimjson.postTask(
          `/ClusterComputeResource/${input.clusterId}/ReconfigureComputeResource_Task`,
          { spec: { _typeName: 'ClusterConfigSpecEx', dasConfig }, modify: true },
        );
        await clients.tasks.waitFor(task.value);
        return ok(`HA reconfigured on ${input.clusterId}`, { taskId: task.value });
      },
    ),
  );
};

const registerDrsRecommendations = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'drs_recommendations',
    {
      title: 'List DRS Recommendations',
      description:
        'Returns the current DRS recommendations for a cluster via VI/JSON ClusterComputeResource.recommendation.',
      inputSchema: z.object({ clusterId: moRefId }),
      outputSchema: z.object({ recommendations: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('drs_recommendations', async (input) => {
      const recommendations = await clients.vimjson
        .get<unknown>(`/ClusterComputeResource/${input.clusterId}/recommendation`)
        .catch(() => undefined);
      const list = unwrapVimArray(recommendations);
      return ok(`Found ${list.length} DRS recommendation(s)`, { recommendations: list });
    }),
  );
};

const registerDrsApply = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'drs_apply',
    {
      title: 'Apply DRS Recommendation',
      description:
        'Applies a DRS recommendation via VI/JSON ClusterComputeResource.ApplyRecommendation.',
      inputSchema: z.object({ clusterId: moRefId, key: z.string(), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ key: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'drs_apply',
      (input) =>
        buildPreview('drs_apply', `Would apply DRS recommendation ${input.key} on ${input.clusterId}`, input),
      async (input) => {
        await clients.vimjson.post(`/ClusterComputeResource/${input.clusterId}/ApplyRecommendation`, { key: input.key });
        return ok(`Applied DRS recommendation ${input.key}`, { key: input.key });
      },
    ),
  );
};
