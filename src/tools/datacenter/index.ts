import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers tools for datacenters and folders.
 */
export const registerDatacenterTools = (server: McpServer, clients: Clients): void => {
  registerDatacenterList(server, clients);
  registerDatacenterCreate(server, clients);
  registerDatacenterDelete(server, clients);
  registerFolderList(server, clients);
  registerFolderCreate(server, clients);
  registerFolderDelete(server, clients);
};

const registerDatacenterList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datacenter_list',
    {
      title: 'List Datacenters',
      description: 'Lists datacenters via /api/vcenter/datacenter.',
      inputSchema: z.object({ names: z.array(z.string()).optional() }),
      outputSchema: z.object({ count: z.number().int(), datacenters: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('datacenter_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      const datacenters = await clients.rest.get<unknown[]>('/vcenter/datacenter', { query });
      return ok(`Found ${datacenters.length} datacenter(s)`, { count: datacenters.length, datacenters });
    }),
  );
};

const registerDatacenterCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datacenter_create',
    {
      title: 'Create Datacenter',
      description: 'Creates a datacenter via POST /api/vcenter/datacenter.',
      inputSchema: z.object({
        name: z.string().min(1),
        folder: z.string().optional().describe('Parent folder MoRef; defaults to the root folder.'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ datacenterId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'datacenter_create',
      (input) =>
        buildPreview('datacenter_create', `Would create datacenter ${input.name}`, {
          method: 'POST',
          path: '/api/vcenter/datacenter',
          body: { name: input.name, folder: input.folder },
        }),
      async (input) => {
        const body: Record<string, unknown> = { name: input.name };
        if (input.folder) body['folder'] = input.folder;
        const result = await clients.rest.post<string | { value: string }>('/vcenter/datacenter', body);
        const datacenterId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Created datacenter ${input.name} (${datacenterId})`, { datacenterId });
      },
    ),
  );
};

const registerDatacenterDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datacenter_delete',
    {
      title: 'Delete Datacenter',
      description: 'Deletes a datacenter via DELETE /api/vcenter/datacenter/{id}. Force deletes children if requested.',
      inputSchema: z.object({ datacenterId: moRefId, force: z.boolean().default(false), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ datacenterId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'datacenter_delete',
      (input) =>
        buildPreview('datacenter_delete', `Would DELETE datacenter ${input.datacenterId}`, {
          method: 'DELETE',
          path: `/api/vcenter/datacenter/${input.datacenterId}`,
          query: { force: input.force },
        }),
      async (input) => {
        await clients.rest.del(`/vcenter/datacenter/${input.datacenterId}`, { query: { force: input.force } });
        return ok(`Deleted datacenter ${input.datacenterId}`, { datacenterId: input.datacenterId });
      },
    ),
  );
};

const registerFolderList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'folder_list',
    {
      title: 'List Folders',
      description: 'Lists inventory folders via /api/vcenter/folder.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        type: z.enum(['DATACENTER', 'DATASTORE', 'HOST', 'NETWORK', 'VIRTUAL_MACHINE']).optional(),
        parentFolders: z.array(z.string()).optional(),
        datacenters: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), folders: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('folder_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.type) query['type'] = input.type;
      if (input.parentFolders?.length) query['parent_folders'] = input.parentFolders.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      const folders = await clients.rest.get<unknown[]>('/vcenter/folder', { query });
      return ok(`Found ${folders.length} folder(s)`, { count: folders.length, folders });
    }),
  );
};

const registerFolderCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'folder_create',
    {
      title: 'Create Folder',
      description: 'Creates an inventory folder via VI/JSON Folder.CreateFolder.',
      inputSchema: z.object({
        parentFolderId: moRefId,
        name: z.string().min(1),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ folderId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'folder_create',
      (input) =>
        buildPreview('folder_create', `Would create folder ${input.name} under ${input.parentFolderId}`, input),
      async (input) => {
        const result = await clients.vimjson.post<{ value?: string }>(`/Folder/${input.parentFolderId}/CreateFolder`, {
          name: input.name,
        });
        return ok(`Created folder ${input.name}`, { folderId: result?.value ?? '' });
      },
    ),
  );
};

const registerFolderDelete = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'folder_delete',
    {
      title: 'Delete Folder',
      description: 'Deletes an inventory folder via VI/JSON Folder.Destroy_Task.',
      inputSchema: z.object({ folderId: moRefId, confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'folder_delete',
      (input) => buildPreview('folder_delete', `Would DELETE folder ${input.folderId}`, input),
      async (input) => {
        const task = await clients.vimjson.postTask(`/Folder/${input.folderId}/Destroy_Task`, {});
        await clients.tasks.waitFor(task.value);
        return ok(`Deleted folder ${input.folderId}`, { taskId: task.value });
      },
    ),
  );
};
