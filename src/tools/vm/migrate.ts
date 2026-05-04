import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { moRef } from '../../client/vimjson-client.js';

/**
 * Registers vm_migrate which performs a vMotion (compute migration) via the
 * VI/JSON `MigrateVM_Task` method.
 */
export const registerVmMigrate = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    vmId: moRefId,
    targetHost: z.string().optional().describe('Destination host MoRef.'),
    targetPool: z.string().optional().describe('Destination resource pool MoRef.'),
    priority: z.enum(['lowPriority', 'highPriority', 'defaultPriority']).default('defaultPriority'),
    state: z.enum(['poweredOn', 'poweredOff', 'suspended']).optional(),
    confirm: confirmFlag,
  });

  server.registerTool(
    'vm_migrate',
    {
      title: 'vMotion VM',
      description: 'Performs a vMotion (compute migration) of a VM via VI/JSON MigrateVM_Task.',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_migrate',
      (input) =>
        buildPreview(
          'vm_migrate',
          `Would vMotion VM ${input.vmId} -> ${input.targetHost ?? input.targetPool ?? 'auto'} (${input.priority})`,
          buildMigrateBody(input),
        ),
      async (input) => {
        const task = await clients.vimjson.postTask(`/VirtualMachine/${input.vmId}/MigrateVM_Task`, buildMigrateBody(input));
        await clients.tasks.waitFor(task.value);
        return ok(`vMotion of ${input.vmId} completed`, { vmId: input.vmId, taskId: task.value });
      },
    ),
  );
};

const buildMigrateBody = (input: {
  vmId: string;
  targetHost?: string;
  targetPool?: string;
  priority: string;
  state?: string;
}): Record<string, unknown> => {
  const body: Record<string, unknown> = { priority: input.priority };
  if (input.targetHost) body['host'] = moRef('HostSystem', input.targetHost);
  if (input.targetPool) body['pool'] = moRef('ResourcePool', input.targetPool);
  if (input.state) body['state'] = input.state;
  return body;
};
