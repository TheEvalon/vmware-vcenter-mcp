import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers vSphere Lifecycle Manager (vLCM) cluster image tools.
 *
 * Endpoints:
 * - GET /api/esx/settings/clusters/{cluster}/software             - effective image
 * - POST /api/esx/settings/clusters/{cluster}/software?action=check - precheck
 * - POST /api/esx/settings/clusters/{cluster}/software?action=apply - remediate
 */
export const registerLifecycleTools = (server: McpServer, clients: Clients): void => {
  registerLifecycleListImage(server, clients);
  registerLifecycleCheck(server, clients);
  registerLifecycleRemediate(server, clients);
};

const registerLifecycleListImage = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'lifecycle_listClusterImage',
    {
      title: 'List Cluster Image',
      description: 'Returns the desired and current vLCM image for a cluster via /api/esx/settings/clusters/{id}/software.',
      inputSchema: z.object({ clusterId: moRefId }),
      outputSchema: z.object({ image: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('lifecycle_listClusterImage', async (input) => {
      const image = await clients.rest.get<unknown>(`/esx/settings/clusters/${input.clusterId}/software`);
      return ok(`Cluster ${input.clusterId} image`, { image });
    }),
  );
};

const registerLifecycleCheck = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'lifecycle_checkCompliance',
    {
      title: 'vLCM Compliance Check',
      description:
        'Runs a compliance check for the cluster image via POST /api/esx/settings/clusters/{id}/software?action=check-compliance.',
      inputSchema: z.object({ clusterId: moRefId }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    safeReadOnly('lifecycle_checkCompliance', async (input) => {
      const result = await clients.rest.post<unknown>(
        `/esx/settings/clusters/${input.clusterId}/software`,
        undefined,
        { query: { action: 'check-compliance' } },
      );
      return ok(`Compliance check submitted for ${input.clusterId}`, { result });
    }),
  );
};

const registerLifecycleRemediate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'lifecycle_remediate',
    {
      title: 'vLCM Remediate Cluster',
      description:
        'Remediates the cluster to its desired image via POST /api/esx/settings/clusters/{id}/software?action=apply. Hosts may reboot.',
      inputSchema: z.object({ clusterId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string().optional() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'lifecycle_remediate',
      (input) => buildPreview('lifecycle_remediate', `Would REMEDIATE cluster ${input.clusterId} (hosts may reboot!)`, input),
      async (input) => {
        const result = await clients.rest.post<{ value?: string } | string>(
          `/esx/settings/clusters/${input.clusterId}/software`,
          undefined,
          { query: { action: 'apply' } },
        );
        const taskId = typeof result === 'string' ? result : (result?.value ?? undefined);
        return ok(`Remediation started for ${input.clusterId}`, { taskId });
      },
    ),
  );
};
