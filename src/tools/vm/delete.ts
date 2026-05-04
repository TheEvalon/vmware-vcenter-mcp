import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers vm_delete which deletes a VM (must be powered off).
 */
export const registerVmDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_delete',
    {
      title: 'Delete VM',
      description:
        'Permanently deletes a powered-off VM via DELETE /api/vcenter/vm/{id}. Disks are removed; cannot be undone.',
      inputSchema: z.object({ vmId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), deleted: z.boolean() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'vm_delete',
      (input) =>
        buildPreview('vm_delete', `Would PERMANENTLY DELETE VM ${input.vmId}`, {
          method: 'DELETE',
          path: `/api/vcenter/vm/${input.vmId}`,
        }),
      async (input) => {
        await clients.rest.del(`/vcenter/vm/${input.vmId}`);
        return ok(`Deleted VM ${input.vmId}`, { vmId: input.vmId, deleted: true });
      },
    ),
  );
};
