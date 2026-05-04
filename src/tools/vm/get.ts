import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { moRefId } from '../../schemas/common.js';

/**
 * Registers vm_get which fetches the full Automation REST representation of a VM.
 */
export const registerVmGet = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_get',
    {
      title: 'Get VM',
      description: 'Returns the full configuration / hardware / state of a VM via /api/vcenter/vm/{id}.',
      inputSchema: z.object({ vmId: moRefId }),
      outputSchema: z.object({ vm: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('vm_get', async (input) => {
      const vm = await clients.rest.get<unknown>(`/vcenter/vm/${input.vmId}`);
      const name = (vm as { name?: string })?.name ?? input.vmId;
      return ok(`VM ${name}`, { vm });
    }),
  );
};
