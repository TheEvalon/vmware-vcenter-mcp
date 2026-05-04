import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers tools for guest OS customization specs.
 *
 * Spec management uses Automation REST (`/api/vcenter/guest/customization-specs`)
 * but applying a spec at clone or VM customization time uses VI/JSON
 * `VirtualMachine.CustomizeVM_Task`.
 */
export const registerCustomizationTools = (server: McpServer, clients: Clients): void => {
  registerCustomizationList(server, clients);
  registerCustomizationGet(server, clients);
  registerCustomizationApply(server, clients);
};

const registerCustomizationList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'customization_list',
    {
      title: 'List Customization Specs',
      description: 'Lists guest OS customization specs via /api/vcenter/guest/customization-specs.',
      inputSchema: z.object({ names: z.array(z.string()).optional() }),
      outputSchema: z.object({ count: z.number().int(), specs: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('customization_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      const specs = await clients.rest.get<unknown[]>('/vcenter/guest/customization-specs', { query });
      return ok(`Found ${specs.length} customization spec(s)`, { count: specs.length, specs });
    }),
  );
};

const registerCustomizationGet = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'customization_get',
    {
      title: 'Get Customization Spec',
      description: 'Returns the details of a single customization spec via /api/vcenter/guest/customization-specs/{name}.',
      inputSchema: z.object({ name: z.string().min(1) }),
      outputSchema: z.object({ spec: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('customization_get', async (input) => {
      const spec = await clients.rest.get<unknown>(`/vcenter/guest/customization-specs/${encodeURIComponent(input.name)}`);
      return ok(`Customization spec ${input.name}`, { spec });
    }),
  );
};

const registerCustomizationApply = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'customization_apply',
    {
      title: 'Apply Customization Spec to VM',
      description:
        'Applies a customization spec to an existing VM via VI/JSON VirtualMachine.CustomizeVM_Task. Spec is fetched by name and replayed.',
      inputSchema: z.object({ vmId: moRefId, specName: z.string().min(1), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'customization_apply',
      (input) => buildPreview('customization_apply', `Would apply customization spec ${input.specName} to ${input.vmId}`, input),
      async (input) => {
        const wrapper = await clients.rest.get<Record<string, unknown>>(
          `/vcenter/guest/customization-specs/${encodeURIComponent(input.specName)}`,
        );
        const spec = wrapper['spec'] ?? wrapper;
        const task = await clients.vimjson.postTask(`/VirtualMachine/${input.vmId}/CustomizeVM_Task`, { spec });
        await clients.tasks.waitFor(task.value);
        return ok(`Applied customization spec ${input.specName} to ${input.vmId}`, { taskId: task.value });
      },
    ),
  );
};
