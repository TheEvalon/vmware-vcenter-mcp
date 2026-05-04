import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers vm_reconfigure which adjusts CPU/memory/name on an existing VM.
 *
 * The Automation REST API exposes individual sub-resources (e.g.
 * `/vcenter/vm/{id}/hardware/cpu`, `/hardware/memory`); we issue PATCHes for
 * just the fields the caller supplied.
 */
export const registerVmReconfigure = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    vmId: moRefId,
    name: z.string().optional(),
    cpuCount: z.number().int().positive().optional(),
    cpuHotAdd: z.boolean().optional(),
    memoryMiB: z.number().int().positive().optional(),
    memoryHotAdd: z.boolean().optional(),
    confirm: confirmFlag,
  });

  server.registerTool(
    'vm_reconfigure',
    {
      title: 'Reconfigure VM',
      description: 'Updates basic VM hardware (CPU count, memory, hot-add toggles) and/or name via Automation REST.',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), updated: z.array(z.string()) })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_reconfigure',
      (input) => {
        const ops = describeOps(input);
        return buildPreview('vm_reconfigure', `Would update VM ${input.vmId}: ${ops.join(', ') || 'no-op'}`, {
          vmId: input.vmId,
          operations: ops,
        });
      },
      async (input) => {
        const updated: string[] = [];
        if (input.name) {
          await clients.rest.patch(`/vcenter/vm/${input.vmId}`, { name: input.name });
          updated.push('name');
        }
        if (input.cpuCount !== undefined || input.cpuHotAdd !== undefined) {
          const body: Record<string, unknown> = {};
          if (input.cpuCount !== undefined) body['count'] = input.cpuCount;
          if (input.cpuHotAdd !== undefined) body['hot_add_enabled'] = input.cpuHotAdd;
          await clients.rest.patch(`/vcenter/vm/${input.vmId}/hardware/cpu`, body);
          updated.push('cpu');
        }
        if (input.memoryMiB !== undefined || input.memoryHotAdd !== undefined) {
          const body: Record<string, unknown> = {};
          if (input.memoryMiB !== undefined) body['size_MiB'] = input.memoryMiB;
          if (input.memoryHotAdd !== undefined) body['hot_add_enabled'] = input.memoryHotAdd;
          await clients.rest.patch(`/vcenter/vm/${input.vmId}/hardware/memory`, body);
          updated.push('memory');
        }
        return ok(`Reconfigured ${input.vmId} (${updated.join(', ') || 'no changes'})`, {
          vmId: input.vmId,
          updated,
        });
      },
    ),
  );
};

const describeOps = (input: {
  name?: string;
  cpuCount?: number;
  cpuHotAdd?: boolean;
  memoryMiB?: number;
  memoryHotAdd?: boolean;
}): string[] => {
  const ops: string[] = [];
  if (input.name) ops.push(`rename -> ${input.name}`);
  if (input.cpuCount !== undefined) ops.push(`cpu.count = ${input.cpuCount}`);
  if (input.cpuHotAdd !== undefined) ops.push(`cpu.hot_add = ${input.cpuHotAdd}`);
  if (input.memoryMiB !== undefined) ops.push(`memory = ${input.memoryMiB} MiB`);
  if (input.memoryHotAdd !== undefined) ops.push(`memory.hot_add = ${input.memoryHotAdd}`);
  return ops;
};
