import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

const ACTIONS = {
  vm_powerOn: { action: 'start', verb: 'power on', destructive: false },
  vm_powerOff: { action: 'stop', verb: 'POWER OFF (hard)', destructive: true },
  vm_reset: { action: 'reset', verb: 'RESET (hard)', destructive: true },
  vm_suspend: { action: 'suspend', verb: 'suspend', destructive: false },
} as const;

const GUEST_ACTIONS = {
  vm_shutdown: { method: 'POST', path: 'shutdown', verb: 'graceful shutdown' },
  vm_reboot: { method: 'POST', path: 'reboot', verb: 'graceful reboot' },
} as const;

/**
 * Registers all VM power-state tools (powerOn, powerOff, reset, suspend) plus
 * the guest-OS-aware shutdown/reboot pair and a power-state read tool.
 */
export const registerVmPower = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vm_powerState',
    {
      title: 'Get VM Power State',
      description: 'Returns the current power state of a VM via GET /api/vcenter/vm/{id}/power.',
      inputSchema: z.object({ vmId: moRefId }),
      outputSchema: z.object({ vmId: z.string(), state: z.string() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('vm_powerState', async (input) => {
      const res = await clients.rest.get<{ state?: string } | string>(`/vcenter/vm/${input.vmId}/power`);
      const state = typeof res === 'string' ? res : (res?.state ?? 'UNKNOWN');
      return ok(`VM ${input.vmId} is ${state}`, { vmId: input.vmId, state });
    }),
  );

  for (const [name, meta] of Object.entries(ACTIONS) as Array<[keyof typeof ACTIONS, (typeof ACTIONS)[keyof typeof ACTIONS]]>) {
    server.registerTool(
      name,
      {
        title: name,
        description: `Performs ${meta.verb} on a VM via POST /api/vcenter/vm/{id}/power?action=${meta.action}.`,
        inputSchema: z.object({ vmId: moRefId, confirm: confirmFlag }),
        outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), action: z.string() })),
        annotations: { destructiveHint: meta.destructive, idempotentHint: false },
      },
      withConfirm(
        name,
        (input) =>
          buildPreview(name, `Would ${meta.verb} VM ${input.vmId}`, {
            method: 'POST',
            path: `/api/vcenter/vm/${input.vmId}/power?action=${meta.action}`,
          }),
        async (input) => {
          await clients.rest.post(`/vcenter/vm/${input.vmId}/power`, undefined, {
            query: { action: meta.action },
          });
          return ok(`${meta.verb} requested for ${input.vmId}`, { vmId: input.vmId, action: meta.action });
        },
      ),
    );
  }

  for (const [name, meta] of Object.entries(GUEST_ACTIONS) as Array<[keyof typeof GUEST_ACTIONS, (typeof GUEST_ACTIONS)[keyof typeof GUEST_ACTIONS]]>) {
    server.registerTool(
      name,
      {
        title: name,
        description: `Sends a ${meta.verb} request to the guest OS via /api/vcenter/vm/{id}/guest/power?action=${meta.path}.`,
        inputSchema: z.object({ vmId: moRefId, confirm: confirmFlag }),
        outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), action: z.string() })),
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      withConfirm(
        name,
        (input) =>
          buildPreview(name, `Would request guest ${meta.verb} for VM ${input.vmId}`, {
            method: 'POST',
            path: `/api/vcenter/vm/${input.vmId}/guest/power?action=${meta.path}`,
          }),
        async (input) => {
          await clients.rest.post(`/vcenter/vm/${input.vmId}/guest/power`, undefined, {
            query: { action: meta.path },
          });
          return ok(`Guest ${meta.verb} requested for ${input.vmId}`, { vmId: input.vmId, action: meta.path });
        },
      ),
    );
  }
};
