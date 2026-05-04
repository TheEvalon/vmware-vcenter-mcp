import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { moRef } from '../../client/vimjson-client.js';

/**
 * Registers vm_relocate which performs a Storage vMotion via VI/JSON
 * `RelocateVM_Task`. Allows simultaneous host + datastore moves.
 */
export const registerVmRelocate = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    vmId: moRefId,
    datastore: z.string().optional().describe('Destination datastore MoRef.'),
    host: z.string().optional().describe('Destination host MoRef.'),
    pool: z.string().optional().describe('Destination resource pool MoRef.'),
    folder: z.string().optional().describe('Destination folder MoRef.'),
    priority: z.enum(['lowPriority', 'highPriority', 'defaultPriority']).default('defaultPriority'),
    confirm: confirmFlag,
  });

  server.registerTool(
    'vm_relocate',
    {
      title: 'Storage vMotion / Relocate VM',
      description: 'Performs a Storage vMotion or relocation via VI/JSON RelocateVM_Task.',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), taskId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_relocate',
      (input) => buildPreview('vm_relocate', `Would relocate VM ${input.vmId}`, buildRelocateBody(input)),
      async (input) => {
        const task = await clients.vimjson.postTask(`/VirtualMachine/${input.vmId}/RelocateVM_Task`, buildRelocateBody(input));
        await clients.tasks.waitFor(task.value);
        return ok(`Relocation of ${input.vmId} completed`, { vmId: input.vmId, taskId: task.value });
      },
    ),
  );
};

const buildRelocateBody = (input: {
  vmId: string;
  datastore?: string;
  host?: string;
  pool?: string;
  folder?: string;
  priority: string;
}): Record<string, unknown> => {
  const spec: Record<string, unknown> = { _typeName: 'VirtualMachineRelocateSpec' };
  if (input.datastore) spec['datastore'] = moRef('Datastore', input.datastore);
  if (input.host) spec['host'] = moRef('HostSystem', input.host);
  if (input.pool) spec['pool'] = moRef('ResourcePool', input.pool);
  if (input.folder) spec['folder'] = moRef('Folder', input.folder);
  return { spec, priority: input.priority };
};
