import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { moRefId } from '../../schemas/common.js';

/**
 * Registers vm_consoleTicket which mints a single-use VMRC ticket for the VM
 * via VI/JSON `AcquireMksTicket`.
 */
export const registerVmConsoleTicket = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_consoleTicket',
    {
      title: 'VM Console Ticket',
      description:
        'Acquires a single-use MKS ticket so a VMRC client can connect to the VM console (VI/JSON AcquireMksTicket).',
      inputSchema: z.object({ vmId: moRefId }),
      outputSchema: z.object({
        ticket: z.string(),
        host: z.string().optional(),
        port: z.number().optional(),
        sslThumbprint: z.string().optional(),
        cfgFile: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    safeReadOnly('vm_consoleTicket', async (input) => {
      const result = await clients.vimjson.post<Record<string, unknown>>(
        `/VirtualMachine/${input.vmId}/AcquireMksTicket`,
        {},
      );
      const ticket = String(result['ticket'] ?? '');
      return ok(`Acquired MKS ticket for ${input.vmId}`, {
        ticket,
        host: typeof result['host'] === 'string' ? (result['host'] as string) : undefined,
        port: typeof result['port'] === 'number' ? (result['port'] as number) : undefined,
        sslThumbprint: typeof result['sslThumbprint'] === 'string' ? (result['sslThumbprint'] as string) : undefined,
        cfgFile: typeof result['cfgFile'] === 'string' ? (result['cfgFile'] as string) : undefined,
      });
    }),
  );
};
