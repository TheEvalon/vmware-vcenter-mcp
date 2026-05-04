import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag } from '../../schemas/common.js';

/**
 * Registers tools for VM templates and Content Library items.
 *
 * - VM templates live under /api/vcenter/vm-template/library-items in vCenter
 *   8.0 and are deployed as full VMs.
 * - Content libraries (local + subscribed) live under /api/content/library and
 *   contain items (OVF templates, ISOs).
 */
export const registerTemplateTools = (server: McpServer, clients: Clients): void => {
  registerTemplateList(server, clients);
  registerTemplateDeploy(server, clients);
  registerContentLibraryList(server, clients);
  registerContentLibraryItemList(server, clients);
  registerContentLibraryItemDeploy(server, clients);
  registerContentLibraryPublish(server, clients);
};

const registerTemplateList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'template_list',
    {
      title: 'List VM Templates',
      description: 'Lists VM templates stored as Content Library items via /api/vcenter/vm-template/library-items.',
      inputSchema: z.object({ libraryId: z.string().optional() }),
      outputSchema: z.object({ count: z.number().int(), templates: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('template_list', async (input) => {
      const items = input.libraryId
        ? await clients.rest.get<string[]>(`/content/library/item`, { query: { 'library_id': input.libraryId } })
        : await clients.rest.get<string[]>('/content/library/item').catch(() => []);
      const templates: unknown[] = [];
      for (const id of items.slice(0, 50)) {
        try {
          const item = await clients.rest.get<Record<string, unknown>>(`/content/library/item/${id}`);
          if (item['type'] === 'vm-template' || item['type'] === 'ovf') templates.push(item);
        } catch {
          // skip unreadable items
        }
      }
      return ok(`Found ${templates.length} template item(s)`, { count: templates.length, templates });
    }),
  );
};

const registerTemplateDeploy = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'template_deploy',
    {
      title: 'Deploy VM from Template',
      description: 'Deploys a new VM from a vm-template Content Library item via POST /api/vcenter/vm-template/library-items/{id}?action=deploy.',
      inputSchema: z.object({
        templateLibraryItemId: z.string().min(1),
        name: z.string().min(1),
        folder: z.string().optional(),
        resourcePool: z.string().optional(),
        host: z.string().optional(),
        cluster: z.string().optional(),
        datastore: z.string().optional(),
        powerOn: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'template_deploy',
      (input) =>
        buildPreview('template_deploy', `Would deploy template ${input.templateLibraryItemId} as ${input.name}`, input),
      async (input) => {
        const body: Record<string, unknown> = {
          name: input.name,
          placement: stripUndefined({
            folder: input.folder,
            resource_pool: input.resourcePool,
            host: input.host,
            cluster: input.cluster,
          }),
          power_on: input.powerOn,
        };
        if (input.datastore) body['vm_home_storage'] = { datastore: input.datastore };
        const result = await clients.rest.post<string | { value: string }>(
          `/vcenter/vm-template/library-items/${input.templateLibraryItemId}`,
          body,
          { query: { action: 'deploy' } },
        );
        const vmId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Deployed ${input.name} (${vmId})`, { vmId });
      },
    ),
  );
};

const registerContentLibraryList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'contentLibrary_list',
    {
      title: 'List Content Libraries',
      description: 'Lists content library IDs via /api/content/library and resolves each one for metadata.',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number().int(), libraries: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('contentLibrary_list', async () => {
      const ids = await clients.rest.get<string[]>('/content/library');
      const libraries: unknown[] = [];
      for (const id of ids) {
        try {
          libraries.push(await clients.rest.get<unknown>(`/content/library/${id}`));
        } catch {
          libraries.push({ id, error: 'unreadable' });
        }
      }
      return ok(`Found ${libraries.length} content library/-ies`, { count: libraries.length, libraries });
    }),
  );
};

const registerContentLibraryItemList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'contentLibraryItem_list',
    {
      title: 'List Content Library Items',
      description: 'Lists items in a content library via /api/content/library/item?library_id={id}.',
      inputSchema: z.object({ libraryId: z.string().min(1), expand: z.boolean().default(false) }),
      outputSchema: z.object({ count: z.number().int(), items: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('contentLibraryItem_list', async (input) => {
      const ids = await clients.rest.get<string[]>('/content/library/item', { query: { library_id: input.libraryId } });
      if (!input.expand) return ok(`Found ${ids.length} item(s)`, { count: ids.length, items: ids });
      const items: unknown[] = [];
      for (const id of ids) {
        try {
          items.push(await clients.rest.get<unknown>(`/content/library/item/${id}`));
        } catch {
          items.push({ id, error: 'unreadable' });
        }
      }
      return ok(`Found ${items.length} item(s)`, { count: items.length, items });
    }),
  );
};

const registerContentLibraryItemDeploy = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'contentLibraryItem_deploy',
    {
      title: 'Deploy OVF from Content Library',
      description:
        'Deploys an OVF library item to a VM via POST /api/vcenter/ovf/library-item/{id}?action=deploy.',
      inputSchema: z.object({
        libraryItemId: z.string().min(1),
        name: z.string().min(1),
        folder: z.string().optional(),
        resourcePool: z.string().optional(),
        host: z.string().optional(),
        cluster: z.string().optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string().optional(), succeeded: z.boolean(), errors: z.unknown().optional() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'contentLibraryItem_deploy',
      (input) =>
        buildPreview('contentLibraryItem_deploy', `Would deploy OVF ${input.libraryItemId} as ${input.name}`, input),
      async (input) => {
        const body = {
          target: stripUndefined({
            folder_id: input.folder,
            resource_pool_id: input.resourcePool,
            host_id: input.host,
          }),
          deployment_spec: {
            name: input.name,
            accept_all_EULA: true,
          },
        };
        const result = await clients.rest.post<Record<string, unknown>>(
          `/vcenter/ovf/library-item/${input.libraryItemId}`,
          body,
          { query: { action: 'deploy' } },
        );
        const succeeded = result['succeeded'] === true;
        const resourceId = result['resource_id'] as { id?: string } | undefined;
        return ok(succeeded ? `Deployed ${input.name}` : `OVF deploy failed`, {
          vmId: resourceId?.id,
          succeeded,
          errors: result['error'] ?? undefined,
        });
      },
    ),
  );
};

const registerContentLibraryPublish = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'contentLibrary_publish',
    {
      title: 'Publish Content Library',
      description: 'Publishes the contents of a local content library via POST /api/content/local-library/{id}?action=publish.',
      inputSchema: z.object({ libraryId: z.string().min(1), confirm: confirmFlag }),
      outputSchema: dryRunCompatibleOutput(z.object({ libraryId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    withConfirm(
      'contentLibrary_publish',
      (input) => buildPreview('contentLibrary_publish', `Would publish library ${input.libraryId}`, input),
      async (input) => {
        await clients.rest.post(`/content/local-library/${input.libraryId}`, undefined, { query: { action: 'publish' } });
        return ok(`Published library ${input.libraryId}`, { libraryId: input.libraryId });
      },
    ),
  );
};

const stripUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};
