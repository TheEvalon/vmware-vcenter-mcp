import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers all ESXi host management tools.
 */
export const registerHostTools = (server: McpServer, clients: Clients): void => {
  registerHostList(server, clients);
  registerHostGet(server, clients);
  registerHostMaintenance(server, clients);
  registerHostReboot(server, clients);
  registerHostShutdown(server, clients);
  registerHostDisconnect(server, clients);
  registerHostReconnect(server, clients);
  registerHostAddToCluster(server, clients);
};

const registerHostList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_list',
    {
      title: 'List Hosts',
      description: 'Lists ESXi hosts known to vCenter via /api/vcenter/host.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        clusters: z.array(z.string()).optional(),
        datacenters: z.array(z.string()).optional(),
        connectionStates: z.array(z.enum(['CONNECTED', 'DISCONNECTED', 'NOT_RESPONDING'])).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), hosts: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('host_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.clusters?.length) query['clusters'] = input.clusters.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      if (input.connectionStates?.length) query['connection_states'] = input.connectionStates.join(',');
      const hosts = await clients.rest.get<unknown[]>('/vcenter/host', { query });
      return ok(`Found ${hosts.length} host(s)`, { count: hosts.length, hosts });
    }),
  );
};

const registerHostGet = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_get',
    {
      title: 'Get Host',
      description: 'Returns detailed VI/JSON information for a single host (HostSystem.summary).',
      inputSchema: z.object({ hostId: moRefId }),
      outputSchema: z.object({ summary: z.unknown(), runtime: z.unknown().optional(), config: z.unknown().optional() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('host_get', async (input) => {
      const summary = await clients.vimjson.get<unknown>(`/HostSystem/${input.hostId}/summary`);
      const runtime = await clients.vimjson.get<unknown>(`/HostSystem/${input.hostId}/runtime`).catch(() => undefined);
      return ok(`Host ${input.hostId}`, { summary, runtime });
    }),
  );
};

const registerHostMaintenance = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_enterMaintenance',
    {
      title: 'Enter Maintenance Mode',
      description: 'Puts a host into maintenance mode via VI/JSON HostSystem.EnterMaintenanceMode_Task.',
      inputSchema: z.object({
        hostId: moRefId,
        timeoutSeconds: z.number().int().nonnegative().default(0),
        evacuatePoweredOffVms: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'host_enterMaintenance',
      (input) =>
        buildPreview('host_enterMaintenance', `Would put host ${input.hostId} into MAINTENANCE MODE`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/EnterMaintenanceMode_Task`,
          body: { timeout: input.timeoutSeconds, evacuatePoweredOffVms: input.evacuatePoweredOffVms },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/EnterMaintenanceMode_Task`, {
          timeout: input.timeoutSeconds,
          evacuatePoweredOffVms: input.evacuatePoweredOffVms,
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Host ${input.hostId} entered maintenance mode`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );

  server.registerTool(
    'host_exitMaintenance',
    {
      title: 'Exit Maintenance Mode',
      description: 'Exits maintenance mode for a host via VI/JSON HostSystem.ExitMaintenanceMode_Task.',
      inputSchema: z.object({
        hostId: moRefId,
        timeoutSeconds: z.number().int().nonnegative().default(0),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'host_exitMaintenance',
      (input) =>
        buildPreview('host_exitMaintenance', `Would EXIT maintenance mode on ${input.hostId}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/ExitMaintenanceMode_Task`,
          body: { timeout: input.timeoutSeconds },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/ExitMaintenanceMode_Task`, {
          timeout: input.timeoutSeconds,
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Host ${input.hostId} exited maintenance mode`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );
};

const registerHostReboot = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_reboot',
    {
      title: 'Reboot Host',
      description: 'Reboots a host via VI/JSON HostSystem.RebootHost_Task.',
      inputSchema: z.object({ hostId: moRefId, force: z.boolean().default(false), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'host_reboot',
      (input) =>
        buildPreview('host_reboot', `Would REBOOT host ${input.hostId} (force=${input.force})`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/RebootHost_Task`,
          body: { force: input.force },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/RebootHost_Task`, { force: input.force });
        return ok(`Reboot requested for host ${input.hostId}`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );
};

const registerHostShutdown = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_shutdown',
    {
      title: 'Shutdown Host',
      description: 'Shuts down a host via VI/JSON HostSystem.ShutdownHost_Task.',
      inputSchema: z.object({ hostId: moRefId, force: z.boolean().default(false), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'host_shutdown',
      (input) =>
        buildPreview('host_shutdown', `Would SHUT DOWN host ${input.hostId} (force=${input.force})`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/ShutdownHost_Task`,
          body: { force: input.force },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/ShutdownHost_Task`, {
          force: input.force,
        });
        return ok(`Shutdown requested for host ${input.hostId}`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );
};

const registerHostDisconnect = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_disconnect',
    {
      title: 'Disconnect Host',
      description: 'Disconnects a host from vCenter via VI/JSON HostSystem.DisconnectHost_Task.',
      inputSchema: z.object({ hostId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'host_disconnect',
      (input) =>
        buildPreview('host_disconnect', `Would DISCONNECT host ${input.hostId} from vCenter`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/DisconnectHost_Task`,
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/DisconnectHost_Task`, {});
        await clients.tasks.waitFor(task.value);
        return ok(`Disconnected host ${input.hostId}`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );
};

const registerHostReconnect = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_reconnect',
    {
      title: 'Reconnect Host',
      description: 'Reconnects a host to vCenter via VI/JSON HostSystem.ReconnectHost_Task.',
      inputSchema: z.object({ hostId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ hostId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    withConfirm(
      'host_reconnect',
      (input) =>
        buildPreview('host_reconnect', `Would reconnect host ${input.hostId}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/HostSystem/${input.hostId}/ReconnectHost_Task`,
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/HostSystem/${input.hostId}/ReconnectHost_Task`, {});
        await clients.tasks.waitFor(task.value);
        return ok(`Reconnected host ${input.hostId}`, { hostId: input.hostId, taskId: task.value });
      },
    ),
  );
};

const registerHostAddToCluster = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'host_addToCluster',
    {
      title: 'Add Host to Cluster',
      description:
        'Adds a new ESXi host to a cluster via VI/JSON ClusterComputeResource.AddHost_Task. Requires hostname, user and password for the host.',
      inputSchema: z.object({
        clusterId: moRefId,
        hostname: z.string(),
        userName: z.string(),
        password: z.string(),
        sslThumbprint: z.string().optional(),
        asConnected: z.boolean().default(true),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'host_addToCluster',
      (input) =>
        buildPreview('host_addToCluster', `Would add host ${input.hostname} to cluster ${input.clusterId}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/ClusterComputeResource/${input.clusterId}/AddHost_Task`,
          body: '<<credentials redacted>>',
        }),
      async (input) => {
        const spec: Record<string, unknown> = {
          _typeName: 'HostConnectSpec',
          hostName: input.hostname,
          userName: input.userName,
          password: input.password,
          force: false,
        };
        if (input.sslThumbprint) spec['sslThumbprint'] = input.sslThumbprint;
        const task = await clients.vimjson.postTask(`/ClusterComputeResource/${input.clusterId}/AddHost_Task`, {
          spec,
          asConnected: input.asConnected,
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Added host ${input.hostname} to cluster ${input.clusterId}`, { taskId: task.value });
      },
    ),
  );
};
