import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers vm_clone which clones an existing VM (or template) into a new VM.
 */
export const registerVmClone = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    sourceVmId: moRefId.describe('Source VM (or template) MoRef.'),
    name: z.string().min(1).describe('Name for the cloned VM.'),
    folder: z.string().optional(),
    resourcePool: z.string().optional(),
    host: z.string().optional(),
    datastore: z.string().optional(),
    powerOn: z.boolean().default(false),
    confirm: confirmFlag,
  });

  server.registerTool(
    'vm_clone',
    {
      title: 'Clone VM',
      description: 'Clones a VM/template via POST /api/vcenter/vm/{id}?action=clone.',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_clone',
      (input) =>
        buildPreview(
          'vm_clone',
          `Would clone ${input.sourceVmId} as ${input.name}${input.powerOn ? ' (powered on)' : ''}`,
          { method: 'POST', path: `/api/vcenter/vm?action=clone`, body: buildCloneBody(input) },
        ),
      async (input) => {
        const body = buildCloneBody(input);
        const result = await clients.rest.post<string | { value: string }>('/vcenter/vm', body, {
          query: { action: 'clone' },
        });
        const vmId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Cloned ${input.sourceVmId} -> ${vmId} (${input.name})`, { vmId });
      },
    ),
  );
};

const buildCloneBody = (input: {
  sourceVmId: string;
  name: string;
  folder?: string;
  resourcePool?: string;
  host?: string;
  datastore?: string;
  powerOn: boolean;
}): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    source: input.sourceVmId,
    name: input.name,
    power_on: input.powerOn,
  };
  const placement: Record<string, unknown> = {};
  if (input.folder) placement['folder'] = input.folder;
  if (input.resourcePool) placement['resource_pool'] = input.resourcePool;
  if (input.host) placement['host'] = input.host;
  if (input.datastore) placement['datastore'] = input.datastore;
  if (Object.keys(placement).length) body['placement'] = placement;
  return body;
};
