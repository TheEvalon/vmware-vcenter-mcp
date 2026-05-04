import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers tools that mount/unmount ISOs and list them on a datastore.
 *
 * Mount/unmount route through the Automation REST CD-ROM endpoints; ISO
 * discovery uses VI/JSON HostDatastoreBrowser with a *.iso match pattern.
 */
export const registerIsoTools = (server: McpServer, clients: Clients): void => {
  registerIsoMount(server, clients);
  registerIsoUnmount(server, clients);
  registerIsoList(server, clients);
};

const registerIsoMount = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'iso_mount',
    {
      title: 'Mount ISO',
      description:
        'Adds (or updates) a CD-ROM device on a VM backed by an ISO file via POST /api/vcenter/vm/{id}/hardware/cdrom.',
      inputSchema: z.object({
        vmId: moRefId,
        isoPath: z.string().describe('Datastore path to the ISO, e.g. "[datastore1] iso/ubuntu.iso".'),
        startConnected: z.boolean().default(true),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ cdromId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'iso_mount',
      (input) => buildPreview('iso_mount', `Would mount ${input.isoPath} on ${input.vmId}`, input),
      async (input) => {
        const result = await clients.rest.post<string | { value: string }>(
          `/vcenter/vm/${input.vmId}/hardware/cdrom`,
          {
            type: 'SATA',
            backing: { type: 'ISO_FILE', iso_file: input.isoPath },
            start_connected: input.startConnected,
          },
        );
        const cdromId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Mounted ISO on ${input.vmId} (${cdromId})`, { cdromId });
      },
    ),
  );
};

const registerIsoUnmount = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'iso_unmount',
    {
      title: 'Unmount ISO',
      description: 'Removes a CD-ROM from a VM via DELETE /api/vcenter/vm/{id}/hardware/cdrom/{cdromId}.',
      inputSchema: z.object({ vmId: moRefId, cdromId: z.string().min(1), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string(), cdromId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'iso_unmount',
      (input) => buildPreview('iso_unmount', `Would remove CD-ROM ${input.cdromId} from ${input.vmId}`, input),
      async (input) => {
        await clients.rest.del(`/vcenter/vm/${input.vmId}/hardware/cdrom/${input.cdromId}`);
        return ok(`Removed CD-ROM ${input.cdromId} from ${input.vmId}`, { vmId: input.vmId, cdromId: input.cdromId });
      },
    ),
  );
};

const registerIsoList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'iso_listFromDatastore',
    {
      title: 'List ISOs on Datastore',
      description:
        'Searches a datastore folder for *.iso files via VI/JSON HostDatastoreBrowser.SearchDatastoreSubFolders_Task.',
      inputSchema: z.object({
        datastoreId: moRefId,
        path: z.string().default('[ds] /'),
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('iso_listFromDatastore', async (input) => {
      const browser = await clients.vimjson.get<Record<string, unknown>>(`/Datastore/${input.datastoreId}/browser`);
      const browserMo = (browser?.['value'] as string) ?? '';
      if (!browserMo) throw new Error(`Could not resolve datastore browser for ${input.datastoreId}`);
      const task = await clients.vimjson.postTask(
        `/HostDatastoreBrowser/${browserMo}/SearchDatastoreSubFolders_Task`,
        {
          datastorePath: input.path,
          searchSpec: {
            _typeName: 'HostDatastoreBrowserSearchSpec',
            matchPattern: ['*.iso'],
            details: {
              _typeName: 'FileQueryFlags',
              fileType: true,
              fileSize: true,
              modification: true,
            },
          },
        },
      );
      const info = await clients.tasks.waitFor(task.value);
      const folders = unwrapVimArray<Record<string, unknown>>(info.result);
      return ok(`Searched ${input.path} for *.iso - ${folders.length} folder(s) had matches`, {
        result: { folders },
      });
    }),
  );
};
