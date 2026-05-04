import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag } from '../../schemas/common.js';

/**
 * Registers tools for vSphere tags and tag categories.
 */
export const registerTagTools = (server: McpServer, clients: Clients): void => {
  registerCategoryList(server, clients);
  registerTagList(server, clients);
  registerTagCreate(server, clients);
  registerTagAttach(server, clients);
  registerTagDetach(server, clients);
};

const registerCategoryList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'category_list',
    {
      title: 'List Tag Categories',
      description: 'Lists tag category IDs via /api/cis/tagging/category and optionally expands them.',
      inputSchema: z.object({ expand: z.boolean().default(true) }),
      outputSchema: z.object({ count: z.number().int(), categories: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('category_list', async (input) => {
      const ids = await clients.rest.get<string[]>('/cis/tagging/category');
      if (!input.expand) return ok(`Found ${ids.length} category/-ies`, { count: ids.length, categories: ids });
      const categories: unknown[] = [];
      for (const id of ids) {
        try {
          categories.push(await clients.rest.get<unknown>(`/cis/tagging/category/${id}`));
        } catch {
          categories.push({ id, error: 'unreadable' });
        }
      }
      return ok(`Found ${categories.length} category/-ies`, { count: categories.length, categories });
    }),
  );
};

const registerTagList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'tag_list',
    {
      title: 'List Tags',
      description: 'Lists tags via /api/cis/tagging/tag, optionally filtered by category.',
      inputSchema: z.object({ categoryId: z.string().optional(), expand: z.boolean().default(true) }),
      outputSchema: z.object({ count: z.number().int(), tags: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('tag_list', async (input) => {
      const ids = input.categoryId
        ? await clients.rest.post<string[]>(
            `/cis/tagging/tag/id:${input.categoryId}`,
            undefined,
            { query: { '~action': 'list-tags-for-category' } },
          ).catch(() => clients.rest.get<string[]>('/cis/tagging/tag'))
        : await clients.rest.get<string[]>('/cis/tagging/tag');
      if (!input.expand) return ok(`Found ${ids.length} tag(s)`, { count: ids.length, tags: ids });
      const tags: unknown[] = [];
      for (const id of ids) {
        try {
          tags.push(await clients.rest.get<unknown>(`/cis/tagging/tag/${id}`));
        } catch {
          tags.push({ id, error: 'unreadable' });
        }
      }
      return ok(`Found ${tags.length} tag(s)`, { count: tags.length, tags });
    }),
  );
};

const registerTagCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'tag_create',
    {
      title: 'Create Tag',
      description: 'Creates a new tag in a category via POST /api/cis/tagging/tag.',
      inputSchema: z.object({
        categoryId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ tagId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'tag_create',
      (input) =>
        buildPreview('tag_create', `Would create tag ${input.name} in category ${input.categoryId}`, input),
      async (input) => {
        const result = await clients.rest.post<string | { value: string }>('/cis/tagging/tag', {
          create_spec: {
            category_id: input.categoryId,
            name: input.name,
            description: input.description ?? '',
          },
        });
        const tagId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Created tag ${input.name} (${tagId})`, { tagId });
      },
    ),
  );
};

const registerTagAttach = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'tag_attach',
    {
      title: 'Attach Tag',
      description: 'Attaches a tag to an inventory object via /api/cis/tagging/tag-association.',
      inputSchema: z.object({
        tagId: z.string().min(1),
        objectType: z.string().describe('vSphere type (e.g. VirtualMachine, HostSystem).'),
        objectId: z.string().min(1).describe('Object MoRef value.'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ tagId: z.string(), objectId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    withConfirm(
      'tag_attach',
      (input) => buildPreview('tag_attach', `Would attach tag ${input.tagId} to ${input.objectType}:${input.objectId}`, input),
      async (input) => {
        await clients.rest.post(`/cis/tagging/tag-association/${input.tagId}`, {
          object_id: { id: input.objectId, type: input.objectType },
        }, { query: { action: 'attach' } });
        return ok(`Attached tag ${input.tagId} to ${input.objectType}:${input.objectId}`, {
          tagId: input.tagId,
          objectId: input.objectId,
        });
      },
    ),
  );
};

const registerTagDetach = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'tag_detach',
    {
      title: 'Detach Tag',
      description: 'Detaches a tag from an inventory object via /api/cis/tagging/tag-association.',
      inputSchema: z.object({
        tagId: z.string().min(1),
        objectType: z.string(),
        objectId: z.string().min(1),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ tagId: z.string(), objectId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'tag_detach',
      (input) => buildPreview('tag_detach', `Would detach tag ${input.tagId} from ${input.objectType}:${input.objectId}`, input),
      async (input) => {
        await clients.rest.post(`/cis/tagging/tag-association/${input.tagId}`, {
          object_id: { id: input.objectId, type: input.objectType },
        }, { query: { action: 'detach' } });
        return ok(`Detached tag ${input.tagId}`, { tagId: input.tagId, objectId: input.objectId });
      },
    ),
  );
};
