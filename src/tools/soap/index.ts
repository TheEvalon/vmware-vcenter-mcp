import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag } from '../../schemas/common.js';

/**
 * Generic SOAP escape hatch that lets the agent invoke any vim25 method when
 * neither the Automation REST nor the VI/JSON surface exposes it.
 *
 * Lazily loads `@vates/node-vsphere-soap` on first use. Always confirm-gated
 * because the caller can pass arbitrary args.
 */
export const registerSoapTools = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'soap_runCommand',
    {
      title: 'Run vim25 SOAP Command',
      description:
        'Escape hatch: invokes any vim25 SOAP command via @vates/node-vsphere-soap. Use only when REST/VI-JSON do not expose the operation.',
      inputSchema: z.object({
        command: z.string().min(1).describe('vim25 method name, e.g. RetrievePropertiesEx.'),
        args: z.unknown().describe('Argument object matching the vim25 WSDL signature.'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ result: z.unknown() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'soap_runCommand',
      (input) =>
        buildPreview('soap_runCommand', `Would invoke SOAP ${input.command}`, {
          command: input.command,
          args: input.args,
        }),
      async (input) => {
        const soap = await clients.getSoap();
        const result = await soap.runCommand<unknown>(input.command, input.args);
        return ok(`SOAP ${input.command} completed`, { result });
      },
    ),
  );
};
